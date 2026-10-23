"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Power,
  Redo2,
  Rocket,
  RotateCcw,
  Settings2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Badge, Button, Dropdown, EmptyState, Skeleton } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { cn } from "@/lib/utils";

import {
  CHATBOTS_QK,
  chatbotsApi,
  type BlockData,
  type BlockType,
  type BotGraph,
  type Chatbot,
  type ChatbotDetail,
  type Problems,
  type SimState,
} from "../../../_lib/chatbotsApi";
import { TEAM_QK, teamApi } from "../../../_lib/teamApi";
import { useBusinessName } from "../../../templates/_components/useBusinessName";
import { BLOCKS, BUILTIN_VARIABLES, PALETTE, uid, variablesOf } from "./blocks";
import { BlockEditor } from "./BlockEditor";
import { BuilderContext, type BuilderState } from "./context";
import { EDGE_TYPES, edgeColor, type FlowEdge } from "./edges";
import { NODE_TYPES, type FlowNode } from "./nodes";
import { ReportPanel } from "./ReportPanel";
import { SettingsModal } from "./SettingsModal";
import { TestChat } from "./TestChat";

type Snapshot = { nodes: FlowNode[]; edges: FlowEdge[] };
type SidePanel = "edit" | "test" | "report" | null;
const DRAG_TYPE = "application/chatdesk-block";

const toNodes = (g: BotGraph): FlowNode[] =>
  g.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data ?? {},
    deletable: n.type !== "start",
  }));
const toEdge = (e: {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}): FlowEdge => ({
  id: e.id,
  source: e.source,
  sourceHandle: e.sourceHandle ?? "out",
  target: e.target,
  type: "flow",
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: edgeColor(e.sourceHandle) },
});
const toGraph = (nodes: FlowNode[], edges: FlowEdge[]): BotGraph => ({
  nodes: nodes.map((n) => ({
    id: n.id,
    type: n.type as BlockType,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: n.data,
  })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? "out",
    target: e.target,
  })),
});

function problemMap(p: Problems) {
  const out: BuilderState["problems"] = {};
  for (const e of p.errors)
    if (e.node_id) (out[e.node_id] ??= { errors: [], warnings: [] }).errors.push(e.message);
  for (const w of p.warnings)
    if (w.node_id) (out[w.node_id] ??= { errors: [], warnings: [] }).warnings.push(w.message);
  return out;
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function Palette({ onAdd, compact }: { onAdd: (type: BlockType) => void; compact?: boolean }) {
  return (
    <div className={cn("space-y-4", compact ? "p-4" : "p-3")}>
      {PALETTE.map((g) => (
        <div key={g.group}>
          <p className="text-fg-faint mb-1.5 px-1 text-[11px] font-semibold tracking-wide uppercase">
            {g.group}
          </p>
          <div className={cn("grid gap-1.5", compact && "grid-cols-2")}>
            {g.blocks.map((t) => {
              const b = BLOCKS[t];
              const Icon = b.icon;
              return (
                <button
                  key={t}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, t);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onAdd(t)}
                  aria-label={`Add ${b.label}`}
                  className="border-line bg-surface hover:border-primary/60 group flex cursor-grab items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left shadow-xs transition hover:shadow-sm active:cursor-grabbing"
                >
                  <span
                    className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", b.tone)}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="text-fg block text-[13px] font-semibold">{b.label}</span>
                    <span className="text-fg-subtle line-clamp-2 block text-[11px] leading-snug">
                      {b.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!compact && (
        <p className="text-fg-faint px-1 text-[11px] leading-relaxed">
          Drag a block onto the canvas, or drag from a dot to empty space to add the next one.
        </p>
      )}
    </div>
  );
}

function Canvas({ initial }: { initial: ChatbotDetail }) {
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const dark = useDarkMode();
  const businessName = useBusinessName();
  const [bot, setBot] = useState<Chatbot>(initial);
  const [nodes, setNodes] = useState<FlowNode[]>(() => toNodes(initial.graph));
  const [edges, setEdges] = useState<FlowEdge[]>(() => initial.graph.edges.map(toEdge));
  const [problems, setProblems] = useState<Problems>(initial.problems);
  const [panel, setPanel] = useState<SidePanel>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{
    x: number;
    y: number;
    left: number;
    top: number;
    source: string;
    handle: string;
  } | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [publishing, setPublishing] = useState(false);
  const [days, setDays] = useState(30);
  const [testNode, setTestNode] = useState<string | null>(null);
  const [testTrail, setTestTrail] = useState<SimState["trail"]>([]);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [can, setCan] = useState({ undo: false, redo: false });
  const bump = () => setCan({ undo: past.current.length > 0, redo: future.current.length > 0 });
  const lastEdit = useRef<{ id: string; at: number } | null>(null);
  // what the server has; state so the "Saved / Unsaved" line follows an undo back to the saved version
  const [savedKey, setSavedKey] = useState(() =>
    JSON.stringify(toGraph(toNodes(initial.graph), initial.graph.edges.map(toEdge)))
  );
  const saved = useRef(savedKey);
  const wrapper = useRef<HTMLDivElement>(null);
  const live = useRef({ nodes, edges });
  useLayoutEffect(() => {
    live.current = { nodes, edges };
  }, [nodes, edges]);

  const members = useQuery({
    queryKey: TEAM_QK.MEMBERS,
    queryFn: async () => (await teamApi.members()).data,
  });
  const teams = useQuery({ queryKey: TEAM_QK.TEAMS, queryFn: async () => (await teamApi.teams()).data });
  const report = useQuery({
    queryKey: CHATBOTS_QK.REPORT(bot.id, days),
    queryFn: async () => (await chatbotsApi.report(bot.id, days)).data,
    enabled: panel === "report",
  });

  // show the whole flow once the blocks have their real sizes
  const measured = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => {
    if (!measured || fitted.current) return;
    fitted.current = true;
    requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 300 }));
  }, [measured, flow]);

  // history -------------------------------------------------------------------------------

  const remember = useCallback(() => {
    past.current = [...past.current.slice(-49), live.current];
    future.current = [];
    bump();
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(live.current);
    setNodes(prev.nodes);
    setEdges(prev.edges);
    bump();
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(live.current);
    setNodes(next.nodes);
    setEdges(next.edges);
    bump();
  }, []);

  // saving --------------------------------------------------------------------------------
  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const graphKey = useMemo(() => JSON.stringify(graph), [graph]);
  const saveNow = useCallback(async () => {
    const g = toGraph(live.current.nodes, live.current.edges);
    const key = JSON.stringify(g);
    if (key === saved.current) return true;
    setSaving("saving");
    try {
      const res = await chatbotsApi.saveGraph(bot.id, g);
      saved.current = key;
      setSavedKey(key);
      setProblems(res.data.problems);
      setBot((b) => ({
        ...b,
        has_changes: res.data.has_changes,
        blocks: res.data.blocks,
        updated_at: res.data.updated_at,
      }));
      setSaving("idle");
      return true;
    } catch (err) {
      setSaving("error");
      toast.error(errorMessage(err));
      return false;
    }
  }, [bot.id]);
  useEffect(() => {
    if (graphKey === saved.current) return;
    const t = setTimeout(() => void saveNow(), 900);
    return () => clearTimeout(t);
  }, [graphKey, saveNow]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(toGraph(live.current.nodes, live.current.edges)) !== saved.current)
        e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // editing -------------------------------------------------------------------------------
  const center = useCallback(() => {
    const rect = wrapper.current?.getBoundingClientRect();
    const p = flow.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    });
    return { x: p.x - 150 + (Math.random() * 60 - 30), y: p.y - 80 + (Math.random() * 60 - 30) };
  }, [flow]);

  const addBlock = useCallback(
    (type: BlockType, position?: { x: number; y: number }, from?: { source: string; handle: string }) => {
      remember();
      const id = `${type}_${uid(5)}`;
      const node: FlowNode = {
        id,
        type,
        position: position ?? center(),
        data: BLOCKS[type].make(),
        selected: true,
      };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
      if (from) {
        setEdges((es) => [
          ...es.filter((e) => !(e.source === from.source && (e.sourceHandle ?? "out") === from.handle)),
          toEdge({ id: `e-${uid(8)}`, source: from.source, sourceHandle: from.handle, target: id }),
        ]);
      }
      setEditing(id);
      setPanel("edit");
      setPaletteOpen(false);
    },
    [center, remember]
  );

  const removeBlock = useCallback(
    (id: string) => {
      if (live.current.nodes.find((n) => n.id === id)?.type === "start") return;
      remember();
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setEditing((e) => (e === id ? null : e));
      setPanel((p) => (p === "edit" && editing === id ? null : p));
    },
    [editing, remember]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const n = live.current.nodes.find((x) => x.id === id);
      if (!n || n.type === "start") return;
      remember();
      const copy: FlowNode = {
        id: `${n.type}_${uid(5)}`,
        type: n.type,
        position: { x: n.position.x + 40, y: n.position.y + 60 },
        data: structuredClone(n.data),
        selected: true,
      };
      setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), copy]);
      setEditing(copy.id);
      setPanel("edit");
    },
    [remember]
  );

  const updateData = useCallback(
    (id: string, data: BlockData) => {
      const now = Date.now();
      if (!lastEdit.current || lastEdit.current.id !== id || now - lastEdit.current.at > 1200) remember();
      lastEdit.current = { id, at: now };
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
    },
    [remember]
  );

  const removeEdge = useCallback(
    (id: string) => {
      remember();
      setEdges((es) => es.filter((e) => e.id !== id));
    },
    [remember]
  );

  const focusBlock = useCallback(
    (id: string, open = true) => {
      const n = flow.getNode(id);
      if (!n) return;
      flow.setCenter(n.position.x + 150, n.position.y + (n.measured?.height ?? 200) / 2, {
        zoom: 1,
        duration: 500,
      });
      setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
      if (open) {
        setEditing(id);
        setPanel("edit");
      }
    },
    [flow]
  );

  // canvas events -------------------------------------------------------------------------
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const keep = changes.filter(
        (c) => !(c.type === "remove" && live.current.nodes.find((n) => n.id === c.id)?.type === "start")
      );
      if (keep.some((c) => c.type === "remove")) {
        remember();
        const gone = new Set(keep.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id));
        setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
        if (editing && gone.has(editing)) {
          setEditing(null);
          setPanel(null);
        }
      }
      setNodes((ns) => applyNodeChanges(keep, ns));
    },
    [editing, remember]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      if (changes.some((c) => c.type === "remove")) remember();
      setEdges((es) => applyEdgeChanges(changes, es));
    },
    [remember]
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      remember();
      const handle = c.sourceHandle ?? "out";
      setEdges((es) => [
        ...es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "out") === handle)),
        toEdge({ id: `e-${uid(8)}`, source: c.source, sourceHandle: handle, target: c.target }),
      ]);
    },
    [remember]
  );
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const rect = wrapper.current?.getBoundingClientRect();
    const x = point.clientX - (rect?.left ?? 0);
    const y = point.clientY - (rect?.top ?? 0);
    setQuickAdd({
      x,
      y,
      left: Math.max(8, Math.min(x, (rect?.width ?? 600) - 250)),
      top: Math.max(8, Math.min(y, (rect?.height ?? 600) - 380)),
      source: state.fromNode.id,
      handle: state.fromHandle.id ?? "out",
    });
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      const type = e.dataTransfer.getData(DRAG_TYPE) as BlockType;
      if (!type || !BLOCKS[type]) return;
      e.preventDefault();
      const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addBlock(type, { x: p.x - 150, y: p.y - 40 });
    },
    [addBlock, flow]
  );

  // keyboard: undo / redo / save / duplicate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable=true]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (mod && e.key.toLowerCase() === "d") {
        const sel = live.current.nodes.find((n) => n.selected);
        if (sel) {
          e.preventDefault();
          duplicateBlock(sel.id);
        }
      } else if (e.key === "Escape") {
        setQuickAdd(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicateBlock, redo, saveNow, undo]);

  // publishing ----------------------------------------------------------------------------
  const refresh = () => void queryClient.invalidateQueries({ queryKey: CHATBOTS_QK.ALL });
  const publish = async () => {
    setPublishing(true);
    try {
      if (!(await saveNow())) return;
      const res = await chatbotsApi.publish(bot.id);
      setBot((b) => ({ ...b, ...res.data }));
      setProblems(res.data.problems);
      toast.success(res.message ?? "Published");
      refresh();
    } catch (err) {
      const data = err instanceof CustomerApiError ? (err.data as { problems?: Problems } | null) : null;
      if (data?.problems) {
        setProblems(data.problems);
        setShowProblems(true);
      }
      toast.error(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  };
  const toggleActive = async () => {
    try {
      const res = await chatbotsApi.setActive(bot.id, !bot.active);
      setBot((b) => ({ ...b, ...res.data }));
      toast.success(res.message ?? "Saved");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const discard = async () => {
    const ok = await confirm({
      title: "Discard your changes?",
      message: "The canvas goes back to the version customers get now.",
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await chatbotsApi.discard(bot.id);
      remember();
      setNodes(toNodes(res.data.graph));
      setEdges(res.data.graph.edges.map(toEdge));
      saved.current = JSON.stringify(toGraph(toNodes(res.data.graph), res.data.graph.edges.map(toEdge)));
      setSavedKey(saved.current);
      setBot((b) => ({ ...b, ...res.data }));
      toast.success(res.message ?? "Discarded");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const exportJson = async () => {
    try {
      const res = await chatbotsApi.exportBot(bot.id);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: `${bot.name.replace(/[^\w-]+/g, "-").toLowerCase() || "chatbot"}.json`,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const duplicateBot = async () => {
    try {
      const res = await chatbotsApi.duplicate(bot.id);
      toast.success(res.message ?? "Copied");
      refresh();
      router.push(CUSTOMER_ROUTES.CHATBOT(res.data.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // derived -------------------------------------------------------------------------------
  const vars = useMemo(() => [...BUILTIN_VARIABLES, ...variablesOf(nodes)], [nodes]);
  const map = useMemo(() => problemMap(problems), [problems]);
  const testEdges = useMemo(
    () => new Set(testTrail.filter(([, h]) => h).map(([n, h]) => `${n}|${h}`)),
    [testTrail]
  );
  const editingNode = nodes.find((n) => n.id === editing) ?? null;
  const ctx: BuilderState = {
    problems: map,
    report: panel === "report" ? (report.data ?? null) : null,
    testNode: panel === "test" ? testNode : null,
    testEdges: panel === "test" ? testEdges : new Set(),
    chatbots: initial.chatbots,
    members: Object.fromEntries((members.data ?? []).map((m) => [m.id, m.name || m.email || "Member"])),
    teams: Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name])),
    trigger: { trigger: bot.trigger, keywords: bot.keywords, match: bot.match },
    editable: true,
    edit: (id) => {
      setEditing(id);
      setPanel("edit");
    },
    remove: removeBlock,
    duplicate: duplicateBlock,
    removeEdge,
    openSettings: () => setSettingsOpen(true),
  };
  const getGraph = useCallback(() => toGraph(live.current.nodes, live.current.edges), []);
  const status = !bot.published
    ? { label: "Draft", tone: "warning" as const }
    : !bot.active
      ? { label: "Off", tone: "neutral" as const }
      : { label: `Live · v${bot.version}`, tone: "success" as const };
  const errorCount = problems.errors.length;
  const warnCount = problems.warnings.length;

  return (
    <BuilderContext.Provider value={ctx}>
      <div className="bg-page relative -m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col sm:-m-4 sm:h-[calc(100%+2rem)]">
        {/* top bar */}
        <div className="border-line bg-surface flex items-center gap-2 border-b px-2 py-2 sm:px-3">
          <Link
            href={CUSTOMER_ROUTES.CHATBOTS()}
            aria-label="All chatbots"
            className="text-fg-subtle hover:text-fg hover:bg-page flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="hover:bg-page min-w-0 rounded-lg px-1.5 py-1 text-left"
            aria-label="Chatbot settings"
          >
            <span className="flex items-center gap-2">
              <span className="text-fg truncate text-sm font-semibold sm:text-base">{bot.name}</span>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            </span>
            <span className="text-fg-subtle block truncate text-[11px]" aria-live="polite">
              {saving === "saving" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              ) : saving === "error" ? (
                <span className="text-red-600">Not saved. Check your connection.</span>
              ) : graphKey !== savedKey ? (
                "Unsaved changes"
              ) : bot.published && bot.has_changes ? (
                "Saved · changes not published yet"
              ) : (
                "All changes saved"
              )}
            </span>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              iconOnly
              leftIcon={Undo2}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!can.undo}
              onClick={undo}
              className="hidden sm:inline-flex"
            />
            <Button
              variant="ghost"
              iconOnly
              leftIcon={Redo2}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!can.redo}
              onClick={redo}
              className="hidden sm:inline-flex"
            />
            <Button
              variant={panel === "report" ? "subtle" : "ghost"}
              leftIcon={BarChart3}
              onClick={() => setPanel(panel === "report" ? null : "report")}
              className="hidden md:inline-flex"
            >
              Analytics
            </Button>
            <Button
              variant={panel === "test" ? "subtle" : "secondary"}
              leftIcon={Play}
              aria-label="Test"
              onClick={() => setPanel(panel === "test" ? null : "test")}
            >
              <span className="hidden sm:inline">Test</span>
            </Button>
            <Button
              leftIcon={Rocket}
              aria-label={bot.published ? "Publish changes" : "Publish"}
              loading={publishing}
              onClick={publish}
              disabled={bot.published && !bot.has_changes && graphKey === savedKey}
            >
              <span className="hidden sm:inline">{bot.published ? "Publish changes" : "Publish"}</span>
            </Button>
            <Dropdown
              align="right"
              width="w-56"
              trigger={() => (
                <span
                  className="text-fg-subtle hover:bg-page hover:text-fg flex h-9 w-9 items-center justify-center rounded-lg"
                  aria-label="More"
                >
                  <MoreVertical className="h-4.5 w-4.5" />
                </span>
              )}
              items={[
                { label: "Settings and trigger", icon: Settings2, onClick: () => setSettingsOpen(true) },
                { label: "Analytics", icon: BarChart3, onClick: () => setPanel("report") },
                { label: "Undo", icon: Undo2, onClick: undo, disabled: !can.undo },
                { label: "Redo", icon: Redo2, onClick: redo, disabled: !can.redo },
                "divider",
                {
                  label: bot.active ? "Turn off" : "Turn on",
                  icon: Power,
                  onClick: toggleActive,
                  hidden: !bot.published,
                },
                {
                  label: "Discard unpublished changes",
                  icon: RotateCcw,
                  onClick: discard,
                  hidden: !bot.published || !bot.has_changes,
                },
                { label: "Duplicate chatbot", icon: Copy, onClick: duplicateBot },
                { label: "Export (JSON)", icon: Download, onClick: exportJson },
              ]}
            />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1">
          <aside
            className="border-line bg-surface hidden w-60 shrink-0 overflow-y-auto border-r lg:block"
            aria-label="Blocks"
          >
            <Palette onAdd={(t) => addBlock(t)} />
          </aside>

          <div
            ref={wrapper}
            className="relative min-w-0 flex-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <ReactFlow<FlowNode, FlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              onNodeDragStart={() => remember()}
              onNodeClick={(_, n) => {
                if (n.type === "start") return;
                setEditing(n.id);
                setPanel("edit");
              }}
              onPaneClick={() => {
                setQuickAdd(null);
                if (panel === "edit") setPanel(null);
              }}
              isValidConnection={(c) =>
                c.source !== c.target && live.current.nodes.find((n) => n.id === c.target)?.type !== "start"
              }
              colorMode={dark ? "dark" : "light"}
              minZoom={0.15}
              maxZoom={2}
              snapToGrid
              snapGrid={[10, 10]}
              deleteKeyCode={["Backspace", "Delete"]}
              defaultEdgeOptions={{ type: "flow" }}
              connectionRadius={30}
              proOptions={{ hideAttribution: true }}
              className="chatbot-canvas"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
              <Controls showInteractive={false} position="bottom-right" />
              <MiniMap
                pannable
                zoomable
                position="top-right"
                className="!hidden md:!block"
                nodeColor={(n) =>
                  n.type === "start" ? "#10b981" : map[n.id]?.errors.length ? "#ef4444" : "#94a3b8"
                }
                maskColor={dark ? "rgba(15,23,42,0.6)" : "rgba(241,245,249,0.6)"}
              />
              <Panel position="bottom-left" className="!m-3 !mb-20 lg:!mb-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowProblems((v) => !v)}
                    className={cn(
                      "bg-surface flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md",
                      errorCount
                        ? "border-red-300 text-red-700 dark:text-red-300"
                        : warnCount
                          ? "border-amber-300 text-amber-700 dark:text-amber-300"
                          : "border-line text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {errorCount ? (
                      <CircleAlert className="h-4 w-4" />
                    ) : warnCount ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {errorCount
                      ? `${errorCount} problem${errorCount > 1 ? "s" : ""}`
                      : warnCount
                        ? `${warnCount} warning${warnCount > 1 ? "s" : ""}`
                        : "Ready to publish"}
                    {errorCount > 0 && warnCount > 0 && (
                      <span className="text-amber-600">
                        · {warnCount} warning{warnCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                  {showProblems && (errorCount > 0 || warnCount > 0) && (
                    <div
                      className="bg-surface border-line absolute bottom-full left-0 mb-2 max-h-72 w-[min(340px,80vw)] overflow-y-auto rounded-xl border p-1.5 shadow-xl"
                      role="list"
                      aria-label="Problems"
                    >
                      {[
                        ...problems.errors.map((p) => ({ ...p, error: true })),
                        ...problems.warnings.map((p) => ({ ...p, error: false })),
                      ].map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          role="listitem"
                          onClick={() => p.node_id && focusBlock(p.node_id)}
                          className="hover:bg-page flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs"
                        >
                          {p.error ? (
                            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-red-500" />
                          ) : (
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
                          )}
                          <span>
                            {p.node_id && (
                              <b className="text-fg">
                                {(() => {
                                  const n = nodes.find((x) => x.id === p.node_id);
                                  return n ? n.data.label || BLOCKS[n.type as BlockType].label : "";
                                })()}
                                :{" "}
                              </b>
                            )}
                            <span className="text-fg-subtle">{p.message}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </ReactFlow>

            {quickAdd && (
              <div
                className="bg-surface border-line absolute z-20 w-60 rounded-xl border p-1.5 shadow-xl"
                style={{ left: quickAdd.left, top: quickAdd.top }}
                role="menu"
                aria-label="Add the next block"
              >
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-fg-subtle text-[11px] font-semibold uppercase">
                    Add the next block
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickAdd(null)}
                    aria-label="Close"
                    className="text-fg-faint hover:text-fg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {PALETTE.flatMap((g) => g.blocks).map((t) => {
                  const b = BLOCKS[t];
                  const Icon = b.icon;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        const p = flow.screenToFlowPosition({
                          x: quickAdd.x + (wrapper.current?.getBoundingClientRect().left ?? 0),
                          y: quickAdd.y + (wrapper.current?.getBoundingClientRect().top ?? 0),
                        });
                        addBlock(
                          t,
                          { x: p.x + 20, y: p.y - 40 },
                          { source: quickAdd.source, handle: quickAdd.handle }
                        );
                        setQuickAdd(null);
                      }}
                      className="hover:bg-page flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                    >
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", b.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-fg">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Add a block"
              className="bg-primary absolute bottom-4 left-1/2 z-10 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-lg lg:hidden"
            >
              <Plus className="h-5 w-5" /> Add block
            </button>
          </div>

          {panel && (
            <aside
              className={cn(
                "bg-surface border-line z-30 flex min-h-0 flex-col",
                "fixed inset-0 z-[70] lg:static lg:inset-auto lg:z-auto lg:w-[400px] lg:shrink-0 lg:border-l"
              )}
            >
              {panel === "edit" && editingNode ? (
                <BlockEditor
                  key={editingNode.id}
                  node={editingNode}
                  bot={{ ...initial, ...bot }}
                  vars={vars}
                  issues={map[editingNode.id]}
                  members={(members.data ?? [])
                    .filter((m) => m.status === "active")
                    .map((m) => ({ value: m.id, label: m.name || m.email || "Member" }))}
                  teams={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
                  onChange={(data) => updateData(editingNode.id, data)}
                  onClose={() => setPanel(null)}
                  onDelete={() => removeBlock(editingNode.id)}
                  onDuplicate={() => duplicateBlock(editingNode.id)}
                  onSettings={() => setSettingsOpen(true)}
                />
              ) : panel === "test" ? (
                <TestChat
                  botId={bot.id}
                  businessName={businessName}
                  firstKeyword={bot.trigger === "keyword" ? (bot.keywords[0] ?? null) : null}
                  getGraph={getGraph}
                  settings={bot.settings}
                  onStep={(node, trail) => {
                    setTestNode(node);
                    setTestTrail(trail);
                  }}
                  onClose={() => {
                    setPanel(null);
                    setTestNode(null);
                    setTestTrail([]);
                  }}
                />
              ) : panel === "report" ? (
                <ReportPanel
                  report={report.data}
                  days={days}
                  onDays={setDays}
                  onClose={() => setPanel(null)}
                  onFocus={(id) => focusBlock(id, false)}
                />
              ) : null}
            </aside>
          )}
        </div>

        {paletteOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-end bg-black/40 lg:hidden"
            onClick={() => setPaletteOpen(false)}
          >
            <div
              className="bg-surface max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Add a block"
            >
              <div className="border-line flex items-center justify-between border-b px-4 py-3">
                <p className="text-fg text-sm font-semibold">Add a block</p>
                <Button
                  variant="ghost"
                  iconOnly
                  leftIcon={X}
                  aria-label="Close"
                  onClick={() => setPaletteOpen(false)}
                />
              </div>
              <Palette onAdd={(t) => addBlock(t)} compact />
            </div>
          </div>
        )}

        {settingsOpen && (
          <SettingsModal
            bot={bot}
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onSaved={(b) => {
              setBot((x) => ({ ...x, ...b }));
              refresh();
            }}
          />
        )}
      </div>
    </BuilderContext.Provider>
  );
}

export function ChatbotBuilder({ id }: { id: number }) {
  const query = useQuery({
    queryKey: CHATBOTS_QK.ONE(id),
    queryFn: async () => (await chatbotsApi.get(id)).data,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (query.isLoading) return <Skeleton className="h-full min-h-[60vh] rounded-xl" />;
  if (!query.data)
    return (
      <EmptyState
        title="Chatbot not found"
        description="It may have been deleted."
        action={
          <Link href={CUSTOMER_ROUTES.CHATBOTS()} className="text-primary text-sm font-medium">
            Back to chatbots
          </Link>
        }
      />
    );
  return (
    <ReactFlowProvider>
      <Canvas initial={query.data} />
    </ReactFlowProvider>
  );
}
