"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { EyeOff } from "lucide-react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { embedApi, type Page, type RecordCard } from "../../_lib/diagramsApi";
import { Line } from "./editor/Line";
import { hiddenIdeas, mindTree } from "./editor/mindmap";
import { applyOps, fromContent, type LineEdge, type ShapeNode } from "./editor/model";
import { FIRST_PAGE, PageTabs, pagesOrDefault } from "./editor/Pages";
import { EditorContext, Shape } from "./editor/Shape";

const NODE_TYPES = { shape: Shape };
const EDGE_TYPES = { line: Line };
const POLL = 5_000;

/** /embed/diagram/<token>: a diagram on another website, view only, kept up to date. */
export function EmbeddedDiagram({ token }: { token: string }) {
  return (
    <ReactFlowProvider>
      <Viewer token={token} />
    </ReactFlowProvider>
  );
}

function Viewer({ token }: { token: string }) {
  const flow = useReactFlow();
  const [state, setState] = useState<{ nodes: ShapeNode[]; edges: LineEdge[] } | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [name, setName] = useState("");
  const [gone, setGone] = useState(false);
  const seq = useRef(0);
  const ready = useRef(false);
  const [cards, setCards] = useState<Map<string, RecordCard>>(new Map());
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [pageId, setPageId] = useState(params?.get("page") || FIRST_PAGE);
  const dark = params?.get("theme") === "dark";
  const list = pagesOrDefault(pages);
  const page = list.some((p) => p.id === pageId) ? pageId : list[0].id;

  const load = useCallback(async () => {
    try {
      const res = await embedApi.get(token);
      seq.current = res.data.seq;
      setName(res.data.name);
      setPages(res.data.pages);
      setState(fromContent(res.data.content));
      ready.current = true;
    } catch {
      setGone(true);
    }
  }, [token]);
  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- the first load
  }, [load]);

  // keep up with changes (every few seconds, while the page is visible)
  useEffect(() => {
    if (gone) return;
    const tick = setInterval(async () => {
      if (document.hidden || !ready.current) return;
      try {
        const res = await embedApi.changes(token, seq.current);
        const c = res.data;
        if (c.gone) return setGone(true);
        setPages(c.pages);
        if (c.reload && c.content) {
          seq.current = c.seq;
          setState(fromContent(c.content));
          return;
        }
        const batches = (c.batches ?? []).filter((b) => b.seq > seq.current);
        if (!batches.length) return;
        seq.current = batches[batches.length - 1].seq;
        setState((prev) =>
          prev
            ? applyOps(
                prev.nodes,
                prev.edges,
                batches.flatMap((b) => b.ops)
              )
            : prev
        );
      } catch (err) {
        if ((err as { status?: number }).status === 404) setGone(true);
      }
    }, POLL);
    return () => clearInterval(tick);
  }, [token, gone]);

  // live cards: what they show (without private details), kept fresh
  const hasCards = !!state?.nodes.some((n) => n.data.record?.id);
  useEffect(() => {
    if (!hasCards || gone) return;
    const fetchCards = () =>
      embedApi
        .records(token)
        .then((res) => setCards(new Map(Object.entries(res.data))))
        .catch(() => null);
    const first = setTimeout(fetchCards, 0);
    const every = setInterval(() => !document.hidden && fetchCards(), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [hasCards, gone, token]);
  const ctx = useMemo(
    () => ({
      editable: false,
      editingId: null,
      setEditingId: () => undefined,
      peerSelection: new Map<string, string[]>(),
      commentCount: new Map<string, number>(),
      records: { cards, canOpen: false },
    }),
    [cards]
  );

  const shown = useMemo(() => {
    if (!state) return [];
    const hidden = hiddenIdeas(mindTree(state.nodes, state.edges), (id) => {
      return !!state.nodes.find((n) => n.id === id)?.data.collapsed;
    });
    return state.nodes.map((n) => ({
      ...n,
      draggable: false,
      hidden: hidden.has(n.id) || (n.data.page ?? FIRST_PAGE) !== page,
    }));
  }, [state, page]);

  useEffect(() => {
    if (!state) return;
    // only once the frame has a size and something on this page is drawn (else the zoom comes out as NaN)
    const t = setTimeout(() => {
      const box = document.querySelector(".react-flow")?.getBoundingClientRect();
      const drawn = flow.getNodes().some((n) => !n.hidden && n.measured?.width);
      if (box && box.width > 0 && box.height > 0 && drawn)
        void flow.fitView({ padding: 0.12, maxZoom: 1.2, duration: 200 });
    }, 120);
    return () => clearTimeout(t);
    // fit when it first shows and when the page changes, not on every update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state, page]);

  if (gone)
    return (
      <div className="bg-page text-fg-subtle flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
        <EyeOff className="text-fg-faint h-6 w-6" />
        This diagram isn&apos;t shown here any more.
      </div>
    );
  if (!state) return <Spinner className="bg-page h-full" />;
  return (
    <div className={dark ? "dark bg-page flex h-full flex-col" : "bg-page flex h-full flex-col"}>
      <div className="relative min-h-0 flex-1">
        <EditorContext.Provider value={ctx}>
          <ReactFlow<ShapeNode, LineEdge>
            nodes={shown}
            edges={state.edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            edgesFocusable={false}
            nodesFocusable={false}
            panOnDrag
            zoomOnScroll={false}
            panOnScroll={false}
            preventScrolling={false}
            zoomOnPinch
            minZoom={0.1}
            maxZoom={3}
            colorMode={dark ? "dark" : "light"}
            proOptions={{ hideAttribution: true }}
            aria-label={name}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </EditorContext.Provider>
        <p className="bg-surface/90 text-fg pointer-events-none absolute top-2 left-2 max-w-[70%] truncate rounded-md px-2 py-1 text-xs font-semibold shadow-sm">
          {name}
        </p>
      </div>
      {list.length > 1 && (
        <PageTabs
          pages={list}
          current={page}
          canEdit={false}
          menu={false}
          onPick={setPageId}
          onAdd={() => undefined}
          onRename={() => undefined}
          onAction={() => undefined}
        />
      )}
    </div>
  );
}
