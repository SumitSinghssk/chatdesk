"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  CircleAlert,
  Download,
  FileImage,
  FileText,
  Hand,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  MousePointer2,
  Presentation,
  Bot,
  ChevronLeft,
  ChevronRight,
  Timer as TimerIcon,
  Palette as PaletteIcon,
  Plus,
  Redo2,
  Sparkles,
  Undo2,
  Wifi,
  WifiOff,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button, Dropdown, type DropdownItem } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import type {
  CatchUp,
  Comment,
  CommentInput,
  DiagramContent,
  LiveState,
  Op,
  Page,
  Person,
  RecordCard,
  RecordHit,
  RecordType,
  AiGraph,
  AiSuggestion,
} from "../../../_lib/diagramsApi";
import { AiPanel, type DiagramAi } from "./AiPanel";
import { graphShapes } from "./aiGraph";
import { ChatbotDialog } from "./ChatbotDialog";
import { fromChatbot, toChatbot, type ChatbotDraft } from "./chatbotFlow";
import type { BotGraph } from "../../../_lib/chatbotsApi";
import { CommentPins, CommentsPanel, pinAt, threads, type TaskInput } from "./Comments";
import { downloadPdf, downloadPng, downloadSvg } from "./exportDiagram";
import { Inspector, type Arrange } from "./Inspector";
import { Line } from "./Line";
import {
  applyOps,
  diff,
  fromContent,
  fromEdge,
  layout,
  newId,
  remember,
  snapshot,
  toEdge,
  defaultData,
  BEHIND,
  SHAPES,
  type LineData,
  type PaletteItem,
  type LineEdge,
  type ShapeData,
  type ShapeNode,
  type Snapshot,
} from "./model";
import { IconPicker } from "./IconPicker";
import { FIRST_PAGE, PageTabs, pagesOrDefault, type PageAction } from "./Pages";
import { RecordPicker, recordKey } from "./Records";
import { addIdea, branchOf, hiddenIdeas, mindLayout, mindTree, rootOf } from "./mindmap";
import { mentionsIn, MentionInput, type Mentionable } from "./MentionInput";
import { TimerPill, WorkshopPanel } from "./Workshop";
import { DRAG_TYPE, Palette } from "./Palette";
import { Avatars, Cursors } from "./Presence";
import { EditorContext, Shape } from "./Shape";
import { SPECIAL } from "./Special";
import { useLive, type Batch, type LiveStatus } from "./useLive";

const NODE_TYPES = { shape: Shape };
const EDGE_TYPES = { line: Line };
const keyOf = (op: { k: string; id: string }) => `${op.k}:${op.id}`;
type MindAction = "save" | "child" | "sibling" | "fold";
const pageOf = (n: ShapeNode) => n.data.page ?? FIRST_PAGE;
/** The shape's data, on `page` (the first page is left unsaid, as in diagrams from before pages). */
const onPage = (data: ShapeData, page: string): ShapeData => {
  const next = { ...data };
  if (page === FIRST_PAGE) delete next.page;
  else next.page = page;
  return next;
};

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

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

export interface CommentsApi {
  list: Comment[];
  canComment: boolean;
  /** a guest writes under a name they type once */
  needsName?: boolean;
  add: (input: CommentInput) => Promise<void>;
  resolve?: (id: number, resolved: boolean) => Promise<void>;
  remove?: (id: number) => Promise<void>;
  canDelete: (c: Comment) => boolean;
  refresh: () => void;
  /** team members can give a comment to someone as a task */
  setTask?: (id: number, task: TaskInput) => Promise<void>;
}

export interface CanvasProps {
  name: string;
  content: DiagramContent;
  seq: number;
  level: string;
  me: Person;
  live: {
    url: (since: number | null) => string;
    changes: (since: number) => Promise<CatchUp>;
    save?: (ops: Op[], clientId: string) => Promise<{ seq: number }>;
    /** the whole diagram again, after a change was refused */
    full: () => Promise<{ content: DiagramContent; seq: number }>;
  };
  comments: CommentsApi | null;
  /** the top bar's left part (back link, name…) */
  title: (state: { name: string; canEdit: boolean; status: LiveStatus }) => ReactNode;
  /** extra buttons on the right of the top bar (share, more…) */
  actions?: ReactNode;
  /** the "More" menu's items (tidy up is added for people who can edit) */
  menu?: DropdownItem[];
  /** a panel the page adds (history) */
  sidePanel?: { key: string; label: string; icon: typeof X; render: (close: () => void) => ReactNode };
  preview?: { content: DiagramContent; label: string; onExit: () => void } | null;
  onMeta?: (meta: { name?: string; folder?: string | null }) => void;
  onLevel?: (level: string) => void;
  focusComment?: number | null;
  /** stores a picture for an image shape and returns its address (members who can edit) */
  uploadImage?: (file: File) => Promise<string>;
  /** timer, votes and approval when the page loaded; kept current by the live connection */
  state?: LiveState | null;
  onState?: (state: LiveState) => void;
  /** team members who can be @mentioned in comments */
  people?: Mentionable[];
  /** workshop controls (members): `canRun` starts timers and votes */
  workshop?: {
    canRun: boolean;
    timer: (minutes: number) => Promise<unknown>;
    voting: (body: { open: boolean; per_person?: number; reset?: boolean }) => Promise<unknown>;
    vote: (nodeId: string, on: boolean) => Promise<unknown>;
  } | null;
  /** a note under the top bar (e.g. "Approved and locked") */
  banner?: ReactNode;
  /** someone starts writing a comment (the page refreshes who can be @mentioned) */
  onCommenting?: () => void;
  /** saves the list of pages (people who can edit) */
  savePages?: (pages: Page[]) => Promise<void>;
  /** asks before a page and what's on it is deleted */
  confirmDeletePage?: (name: string) => Promise<boolean>;
  /** the page to open on (from the address) */
  startPage?: string | null;
  /** chatbots: make one from the flow on this page, or draw one's flow here (team members) */
  chatbot?: {
    make: (name: string, graph: BotGraph) => Promise<void>;
    load: (id: number) => Promise<{ name: string; graph: BotGraph }>;
  };
  /** the business's AI: draw from a description, explain, suggest missing steps (team members) */
  ai?: DiagramAi;
  /** live ChatDesk cards: what they show (for this person), finding records to add, and opening them */
  records?: {
    load: () => Promise<Record<string, RecordCard>>;
    search?: (type: RecordType, q: string) => Promise<RecordHit[]>;
    canOpen: boolean;
  };
}

type Panel = "comments" | "extra" | "workshop" | "ai" | null;

export function Canvas(props: CanvasProps) {
  const { live: liveApi, comments } = props;
  const flow = useReactFlow<ShapeNode, LineEdge>();
  const dark = useDarkMode();
  const initial = useMemo(() => fromContent(props.content), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes] = useState<ShapeNode[]>(initial.nodes);
  const [edges, setEdges] = useState<LineEdge[]>(initial.edges);
  const [name, setName] = useState(props.name);
  const [level, setLevel] = useState(props.level);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(props.focusComment ? "comments" : null);
  const [activeThread, setActiveThread] = useState<number | null>(props.focusComment ?? null);
  const [commentMode, setCommentMode] = useState(false);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number; node_id?: string } | null>(null);
  const [tool, setTool] = useState<"select" | "hand">("select");
  const [sheet, setSheet] = useState<"shapes" | "style" | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [steps, setSteps] = useState({ undo: 0, redo: 0 }); // what the undo / redo buttons can do

  // what the server has (as far as this tab knows), and changes on their way ------------------------
  const snap = useRef<Snapshot>(snapshot(props.content));
  const current = useRef({ nodes: initial.nodes, edges: initial.edges });
  useEffect(() => {
    current.current = { nodes, edges };
  }, [nodes, edges]);
  const commitRef = useRef<() => void>(() => undefined); // the latest commit, for timers
  const pending = useRef(new Map<number, string[]>()); // ref -> element keys
  const pendingCount = useRef(new Map<string, number>());
  const floor = useRef(new Map<string, number>()); // element key -> sequence of this tab's last saved change
  const deferred = useRef<{ seq: number; op: Op }[]>([]);
  const dragging = useRef(new Set<string>());
  const interacting = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<{ before: Op[]; after: Op[] }[]>([]);
  const redoStack = useRef<{ before: Op[]; after: Op[] }[]>([]);
  const clipboard = useRef<{ nodes: ShapeNode[]; edges: LineEdge[] } | null>(null);

  const previewing = !!props.preview;
  const [liveState, setLiveState] = useState<LiveState | null>(props.state ?? null);
  // when the shared timer ends, on this device's clock: counted from the moment the server's word arrived
  const [timerEnds, setTimerEnds] = useState<number | null>(null);
  // pages: the list as last saved (or as just changed here, until the server's word comes back)
  const [pagesDraft, setPagesDraft] = useState<Page[] | null>(null);
  const hearState = useCallback((next: LiveState) => {
    const t = next.session.timer;
    setLiveState(next);
    setPagesDraft(null);
    setTimerEnds(t && typeof t.left === "number" ? Date.now() + t.left * 1000 : null);
  }, []);
  const locked = !!liveState?.locked;
  const pages = pagesOrDefault(pagesDraft ?? liveState?.pages);
  const [pageId, setPageId] = useState<string>(props.startPage || FIRST_PAGE);
  const page = pages.some((p) => p.id === pageId) ? pageId : pages[0].id;
  const [presenting, setPresenting] = useState<number | null>(null); // the slide on screen, when presenting
  const canEdit =
    (level === "edit" || level === "manage") && !previewing && !closed && !locked && presenting === null;
  const canComment = !!comments?.canComment && !previewing && !closed;
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const applyRemote = useCallback((ops: Op[]) => {
    if (!ops.length) return;
    remember(snap.current, ops);
    const next = applyOps(current.current.nodes, current.current.edges, ops, dragging.current);
    current.current = next;
    setNodes(next.nodes);
    setEdges(next.edges);
  }, []);

  const flushDeferred = useCallback(() => {
    const keep: typeof deferred.current = [];
    const apply: Op[] = [];
    for (const d of deferred.current) {
      const key = keyOf(d.op);
      if ((pendingCount.current.get(key) ?? 0) > 0) keep.push(d);
      else if (d.seq > (floor.current.get(key) ?? 0)) apply.push(d.op);
    }
    deferred.current = keep;
    applyRemote(apply);
  }, [applyRemote]);

  const onReload = useCallback((content: DiagramContent) => {
    // changes of this tab that weren't confirmed are kept on top of the fresh copy, then sent again
    const dirty = new Set([...pendingCount.current.entries()].filter(([, c]) => c > 0).map(([k]) => k));
    pending.current.clear();
    pendingCount.current.clear();
    floor.current.clear();
    deferred.current = [];
    setSaving(0);
    snap.current = snapshot(content);
    const fresh = fromContent(content);
    const selected = new Set(
      [...current.current.nodes, ...current.current.edges].filter((x) => x.selected).map((x) => x.id)
    );
    let nextNodes = fresh.nodes.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n));
    let nextEdges = fresh.edges.map((e) => (selected.has(e.id) ? { ...e, selected: true } : e));
    if (dirty.size && canEditRef.current) {
      const mine = new Map<string, ShapeNode>(current.current.nodes.map((n) => [`n:${n.id}`, n]));
      const mineEdges = new Map<string, LineEdge>(current.current.edges.map((e) => [`e:${e.id}`, e]));
      nextNodes = nextNodes.filter((n) => !dirty.has(`n:${n.id}`) || mine.has(`n:${n.id}`));
      nextEdges = nextEdges.filter((e) => !dirty.has(`e:${e.id}`) || mineEdges.has(`e:${e.id}`));
      for (const key of dirty) {
        if (key.startsWith("n:") && mine.has(key)) {
          nextNodes = [...nextNodes.filter((n) => `n:${n.id}` !== key), mine.get(key)!];
        } else if (key.startsWith("e:") && mineEdges.has(key)) {
          nextEdges = [...nextEdges.filter((e) => `e:${e.id}` !== key), mineEdges.get(key)!];
        }
      }
    }
    current.current = { nodes: nextNodes, edges: nextEdges };
    setNodes(nextNodes);
    setEdges(nextEdges);
    if (dirty.size) setTimeout(() => commitRef.current(), 0);
  }, []);

  const live = useLive({
    url: liveApi.url,
    changes: liveApi.changes,
    save: liveApi.save,
    seq: props.seq,
    handlers: {
      onBatch: (batch: Batch) => {
        if (batch.client === live.clientId) return; // ours, already on screen (the confirmation says when it's saved)
        const apply: Op[] = [];
        for (const op of batch.ops) {
          const key = keyOf(op);
          if ((pendingCount.current.get(key) ?? 0) > 0) deferred.current.push({ seq: batch.seq, op });
          else if ((floor.current.get(key) ?? 0) < batch.seq) apply.push(op);
        }
        applyRemote(apply);
      },
      onReload,
      onAck: (ref, seq) => {
        const keys = pending.current.get(ref) ?? [];
        pending.current.delete(ref);
        setSaving(pending.current.size);
        for (const key of keys) {
          pendingCount.current.set(key, Math.max(0, (pendingCount.current.get(key) ?? 1) - 1));
          floor.current.set(key, Math.max(floor.current.get(key) ?? 0, seq));
        }
        flushDeferred();
      },
      onRejected: (ref, message) => {
        pending.current.delete(ref);
        setSaving(pending.current.size);
        toast.error(message);
        liveApi
          .full()
          .then((res) => {
            pendingCount.current.clear();
            onReload(res.content);
          })
          .catch(() => null);
      },
      onComments: () => comments?.refresh(),
      onMeta: (meta) => {
        if (meta.name) setName(meta.name);
        props.onMeta?.(meta);
      },
      onLevel: (next) => {
        setLevel(next);
        props.onLevel?.(next);
        toast.info(
          next === "edit" || next === "manage"
            ? "You can edit this diagram now"
            : "Your access changed: you can't edit now"
        );
      },
      onClosed: (message) => setClosed(message),
      onState: (next) => {
        hearState(next);
        props.onState?.(next);
      },
    },
  });

  // saving this tab's changes ---------------------------------------------------------------------------
  const commitWith = useCallback(
    (nextNodes: ShapeNode[], nextEdges: LineEdge[], record = true) => {
      if (!canEditRef.current) return;
      const ops = diff(snap.current, nextNodes, nextEdges);
      if (!ops.length) return;
      const before: Op[] = ops.map((op) => {
        const saved = snap.current.get(keyOf(op));
        return { k: op.k, id: op.id, v: saved ? JSON.parse(saved) : null };
      });
      if (record) {
        undoStack.current.push({ before, after: ops });
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
        setSteps({ undo: undoStack.current.length, redo: 0 });
      }
      remember(snap.current, ops);
      for (let i = 0; i < ops.length; i += 500) {
        const chunk = ops.slice(i, i + 500);
        const ref = live.send(chunk);
        const keys = chunk.map(keyOf);
        pending.current.set(ref, keys);
        keys.forEach((k) => pendingCount.current.set(k, (pendingCount.current.get(k) ?? 0) + 1));
      }
      setSaving(pending.current.size);
    },
    [live]
  );
  const commit = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (interacting.current) return;
    commitWith(current.current.nodes, current.current.edges);
  }, [commitWith]);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  const later = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commitRef.current(), 120);
  }, []);

  // changes made on the canvas ---------------------------------------------------------------------------
  const onNodesChange = useCallback(
    (changes: NodeChange<ShapeNode>[]) => {
      if (previewing) return;
      let resizing = false;
      for (const c of changes) {
        if (c.type === "dimensions" && c.resizing) resizing = true;
      }
      if (resizing) interacting.current = true;
      else if (interacting.current && changes.some((c) => c.type === "dimensions") && !dragging.current.size)
        interacting.current = false;
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        current.current = { ...current.current, nodes: next };
        return next;
      });
      if (changes.some((c) => c.type !== "select")) later();
    },
    [later, previewing]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<LineEdge>[]) => {
      if (previewing) return;
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        current.current = { ...current.current, edges: next };
        return next;
      });
      if (changes.some((c) => c.type !== "select")) later();
    },
    [later, previewing]
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (!canEdit || c.source === c.target) return;
      const edge = toEdge({
        id: newId("e"),
        source: c.source,
        target: c.target,
        sourceHandle: c.sourceHandle,
        targetHandle: c.targetHandle,
        type: "line",
        data: {},
      });
      setEdges((eds) => {
        const next = [...eds.map((e) => ({ ...e, selected: false })), { ...edge, selected: true }];
        current.current = { ...current.current, edges: next };
        return next;
      });
      later();
    },
    [canEdit, later]
  );
  const onReconnect = useCallback(
    (old: LineEdge, c: Connection) => {
      setEdges((eds) => {
        const next = reconnectEdge(old, c, eds, { shouldReplaceId: false }) as LineEdge[];
        current.current = { ...current.current, edges: next };
        return next;
      });
      later();
    },
    [later]
  );

  const select = (ids: Set<string>, edgeIds: Set<string> = new Set()) => {
    const nextNodes = current.current.nodes.map((n) => ({ ...n, selected: ids.has(n.id) }));
    const nextEdges = current.current.edges.map((e) => ({ ...e, selected: edgeIds.has(e.id) }));
    current.current = { nodes: nextNodes, edges: nextEdges };
    setNodes(nextNodes);
    setEdges(nextEdges);
  };

  const replace = (nextNodes: ShapeNode[], nextEdges: LineEdge[] = current.current.edges, record = true) => {
    current.current = { nodes: nextNodes, edges: nextEdges };
    setNodes(nextNodes);
    setEdges(nextEdges);
    commitWith(nextNodes, nextEdges, record);
  };

  /** Adds a shape from the palette (or a picked icon / uploaded picture) in the middle of the screen or at `at`. */
  const addShape = (
    item: PaletteItem,
    at?: { x: number; y: number },
    extra?: Partial<ShapeData>,
    dims?: { w: number; h: number }
  ) => {
    if (!canEdit) return;
    if (item.action === "icon" && !extra) {
      setIconFor({ mode: "add", at });
      return;
    }
    if (item.action === "record" && !extra) {
      if (props.records?.search) setRecordFor({ type: item.data?.record?.type ?? "contact", at });
      return;
    }
    if (item.action === "image" && !extra) {
      imageAt.current = { mode: "add", at };
      fileInput.current?.click();
      return;
    }
    const kind = item.kind;
    const size = dims ?? { w: item.w, h: item.h };
    const box = wrapper.current?.getBoundingClientRect();
    const center =
      at ??
      flow.screenToFlowPosition({
        x: (box?.left ?? 0) + (box?.width ?? 800) / 2,
        y: (box?.top ?? 0) + (box?.height ?? 600) / 2,
      });
    const id = newId("n");
    // a click on the palette puts it in the middle; if something is already there, step down and right
    const spot = { x: Math.round(center.x - size.w / 2), y: Math.round(center.y - size.h / 2) };
    if (!at) {
      const taken = (x: number, y: number) =>
        current.current.nodes.some(
          (n) =>
            !BEHIND.includes(n.data.shape) &&
            Math.abs(n.position.x + (n.width ?? 160) / 2 - (x + size.w / 2)) < 40 &&
            Math.abs(n.position.y + (n.height ?? 64) / 2 - (y + size.h / 2)) < 40
        );
      for (let i = 0; i < 30 && taken(spot.x, spot.y); i++) {
        spot.x += 32;
        spot.y += 32;
      }
    }
    const plain = !SPECIAL.has(kind) && kind !== "text" && kind !== "frame";
    const node: ShapeNode = {
      id,
      type: "shape",
      position: spot,
      width: size.w,
      height: size.h,
      zIndex: BEHIND.includes(kind) ? -1 : 0,
      data: onPage(
        { ...defaultData(kind, plain ? item.label : undefined), ...(item.data ?? {}), ...(extra ?? {}) },
        page
      ),
      selected: true,
    };
    replace(
      [...current.current.nodes.map((n) => ({ ...n, selected: false })), node],
      current.current.edges.map((e) => ({ ...e, selected: false }))
    );
    setSheet(null);
    if (plain || kind === "text" || kind === "bubble-out" || kind === "bubble-in" || kind === "mind")
      setTimeout(() => setEditingId(id), 30);
  };

  // live ChatDesk cards: what they show, kept fresh (every 30 seconds, and when cards are added) -------------
  const [recordFor, setRecordFor] = useState<{ type: RecordType; at?: { x: number; y: number } } | null>(
    null
  );
  const [cards, setCards] = useState<Map<string, RecordCard>>(new Map());
  const recordKeys = useMemo(
    () =>
      [...new Set(nodes.filter((n) => n.data.record?.id).map((n) => recordKey(n.data.record!)))]
        .sort()
        .join(","),
    [nodes]
  );
  const loadRecords = props.records?.load;
  useEffect(() => {
    if (!recordKeys || !loadRecords) return;
    let stale = false;
    const fetchCards = () =>
      loadRecords()
        .then((res) => !stale && setCards(new Map(Object.entries(res))))
        .catch(() => null);
    const first = setTimeout(fetchCards, 150);
    const every = setInterval(() => !document.hidden && fetchCards(), 30_000);
    return () => {
      stale = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [recordKeys, loadRecords]);

  // pictures: upload, then add (or swap into the selected picture) ---------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null);
  const imageAt = useRef<{ mode: "add" | "replace"; at?: { x: number; y: number } }>({ mode: "add" });
  const [iconFor, setIconFor] = useState<{ mode: "add" | "replace"; at?: { x: number; y: number } } | null>(
    null
  );
  const [uploading, setUploading] = useState(false);
  const addPicture = async (
    file: File,
    target: { mode: "add" | "replace"; at?: { x: number; y: number } }
  ) => {
    if (!props.uploadImage || !canEdit) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      toast.error("Use a PNG, JPG, WEBP or GIF picture");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Pictures can be up to 10 MB");
      return;
    }
    setUploading(true);
    try {
      const url = await props.uploadImage(file);
      const natural = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve({ w: img.naturalWidth || 220, h: img.naturalHeight || 150 });
        img.onerror = () => resolve({ w: 220, h: 150 });
        img.src = url;
      });
      const scale = Math.min(1, 320 / natural.w, 320 / natural.h);
      const dims = {
        w: Math.max(40, Math.round(natural.w * scale)),
        h: Math.max(40, Math.round(natural.h * scale)),
      };
      if (target.mode === "replace") {
        replace(
          current.current.nodes.map((n) =>
            n.selected && n.data.shape === "image" ? { ...n, data: { ...n.data, src: url } } : n
          )
        );
      } else {
        const item = SHAPES.find((x) => x.key === "image:upload")!;
        addShape(item, target.at, { src: url, label: file.name.replace(/\.[^.]+$/, "").slice(0, 60) }, dims);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  // copy, paste, undo -----------------------------------------------------------------------------------------
  const copySelection = () => {
    const picked = current.current.nodes.filter((n) => n.selected);
    if (!picked.length) return false;
    const ids = new Set(picked.map((n) => n.id));
    clipboard.current = {
      nodes: picked,
      edges: current.current.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
    return true;
  };
  const paste = (offset = 24) => {
    const clip = clipboard.current;
    if (!clip || !canEdit) return;
    const map = new Map(clip.nodes.map((n) => [n.id, newId("n")]));
    const nodesNew = clip.nodes.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      data: onPage(n.data, page),
      selected: true,
    }));
    const edgesNew = clip.edges.map((e) => ({
      ...e,
      id: newId("e"),
      source: map.get(e.source)!,
      target: map.get(e.target)!,
      selected: false,
    }));
    clipboard.current = { nodes: nodesNew, edges: edgesNew };
    replace(
      [...current.current.nodes.map((n) => ({ ...n, selected: false })), ...nodesNew],
      [...current.current.edges.map((e) => ({ ...e, selected: false })), ...edgesNew]
    );
  };
  const undo = () => {
    const step = undoStack.current.pop();
    if (!step || !canEdit) return;
    redoStack.current.push(step);
    setSteps({ undo: undoStack.current.length, redo: redoStack.current.length });
    const next = applyOps(current.current.nodes, current.current.edges, step.before);
    replace(next.nodes, next.edges, false);
  };
  const redo = () => {
    const step = redoStack.current.pop();
    if (!step || !canEdit) return;
    undoStack.current.push(step);
    setSteps({ undo: undoStack.current.length, redo: redoStack.current.length });
    const next = applyOps(current.current.nodes, current.current.edges, step.after);
    replace(next.nodes, next.edges, false);
  };

  // style and arrange ---------------------------------------------------------------------------------------------
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const patchNodes = (patch: Partial<ShapeData>) =>
    replace(
      current.current.nodes.map((n) =>
        n.selected
          ? {
              ...n,
              data: { ...n.data, ...patch },
              draggable: patch.locked !== undefined ? !patch.locked : n.draggable,
            }
          : n
      )
    );
  const patchEdges = (patch: Partial<LineData>) =>
    replace(
      current.current.nodes,
      current.current.edges.map((e) =>
        e.selected
          ? { ...toEdge({ ...fromEdge(e), data: { ...(e.data ?? {}), ...patch } }), selected: true }
          : e
      )
    );
  const tidy = (direction: "TB" | "LR", only?: Set<string>) => {
    if (!canEdit) return;
    const here = new Set(current.current.nodes.filter((n) => pageOf(n) === page).map((n) => n.id));
    const pick = only ? new Set([...only].filter((id) => here.has(id))) : here;
    replace(layout(current.current.nodes, current.current.edges, direction, pick));
    setTimeout(() => flow.fitView({ padding: 0.2, duration: 300, maxZoom: 1 }), 50);
  };
  const arrange = (action: Arrange) => {
    const picked = current.current.nodes.filter((n) => n.selected);
    const ids = new Set(picked.map((n) => n.id));
    const w = (n: ShapeNode) => n.width ?? 160;
    const h = (n: ShapeNode) => n.height ?? 64;
    const move = (fn: (n: ShapeNode) => { x: number; y: number }) =>
      replace(
        current.current.nodes.map((n) => (ids.has(n.id) && !n.data.locked ? { ...n, position: fn(n) } : n))
      );
    switch (action) {
      case "pick-icon":
        setIconFor({ mode: "replace" });
        return;
      case "replace-image":
        imageAt.current = { mode: "replace" };
        fileInput.current?.click();
        return;
      case "row-add":
      case "row-remove":
      case "col-add":
      case "col-remove": {
        replace(
          current.current.nodes.map((n) => {
            if (!ids.has(n.id) || n.data.shape !== "table") return n;
            let rows = (n.data.rows ?? [[""]]).map((r) => [...r]);
            const cols = rows[0]?.length ?? 1;
            if (action === "row-add") rows.push(Array(cols).fill(""));
            if (action === "row-remove" && rows.length > 1) rows = rows.slice(0, -1);
            if (action === "col-add") rows = rows.map((r) => [...r, ""]);
            if (action === "col-remove" && cols > 1) rows = rows.map((r) => r.slice(0, -1));
            const rowH = Math.max(24, Math.round((n.data.fontSize ?? 13) * 2.2));
            const colW = (n.width ?? 320) / cols;
            return {
              ...n,
              width: action.startsWith("col")
                ? Math.max(80, Math.round(colW * (rows[0]?.length ?? 1)))
                : n.width,
              height: action.startsWith("row") ? Math.max(rowH, rowH * rows.length + 4) : n.height,
              data: { ...n.data, rows },
            };
          })
        );
        return;
      }
      case "delete":
        void flow.deleteElements({ nodes: picked, edges: current.current.edges.filter((e) => e.selected) });
        return;
      case "duplicate":
        if (copySelection()) paste();
        return;
      case "edit-text": {
        const edge = current.current.edges.find((e) => e.selected);
        setEditingId(picked[0] ? picked[0].id : edge ? `edge:${edge.id}` : null);
        return;
      }
      case "front":
      case "back": {
        const z = current.current.nodes.map((n) => n.zIndex ?? 0);
        const value = action === "front" ? Math.max(0, ...z) + 1 : Math.min(0, ...z) - 1;
        replace(
          current.current.nodes.map((n) =>
            ids.has(n.id) && !BEHIND.includes(n.data.shape) ? { ...n, zIndex: value } : n
          )
        );
        return;
      }
      case "tidy-TB":
      case "tidy-LR":
        tidy(action === "tidy-TB" ? "TB" : "LR", ids.size > 1 ? ids : undefined);
        return;
    }
    if (picked.length < 2) return;
    const left = Math.min(...picked.map((n) => n.position.x));
    const right = Math.max(...picked.map((n) => n.position.x + w(n)));
    const top = Math.min(...picked.map((n) => n.position.y));
    const bottom = Math.max(...picked.map((n) => n.position.y + h(n)));
    if (action === "left") move((n) => ({ x: left, y: n.position.y }));
    if (action === "right") move((n) => ({ x: right - w(n), y: n.position.y }));
    if (action === "center") move((n) => ({ x: (left + right) / 2 - w(n) / 2, y: n.position.y }));
    if (action === "top") move((n) => ({ x: n.position.x, y: top }));
    if (action === "bottom") move((n) => ({ x: n.position.x, y: bottom - h(n) }));
    if (action === "middle") move((n) => ({ x: n.position.x, y: (top + bottom) / 2 - h(n) / 2 }));
    if (action === "spread-x" || action === "spread-y") {
      const across = action === "spread-x";
      const sorted = [...picked].sort((a, b) =>
        across ? a.position.x - b.position.x : a.position.y - b.position.y
      );
      const total = sorted.reduce((s, n) => s + (across ? w(n) : h(n)), 0);
      const gap = ((across ? right - left : bottom - top) - total) / (sorted.length - 1);
      let at = across ? left : top;
      const place = new Map<string, number>();
      for (const n of sorted) {
        place.set(n.id, at);
        at += (across ? w(n) : h(n)) + gap;
      }
      move((n) =>
        across ? { x: place.get(n.id)!, y: n.position.y } : { x: n.position.x, y: place.get(n.id)! }
      );
    }
  };

  // mind maps ------------------------------------------------------------------------------------------------------
  // folding is saved for people who can edit; anyone else folds and unfolds just on their own screen
  const [ownFolds, setOwnFolds] = useState<Map<string, boolean>>(new Map());
  const mind = useMemo(() => mindTree(nodes, edges), [nodes, edges]);
  const folded = useCallback(
    (id: string) => ownFolds.get(id) ?? !!nodes.find((n) => n.id === id)?.data.collapsed,
    [ownFolds, nodes]
  );
  const hidden = useMemo(
    () => hiddenIdeas(mind, (id) => ownFolds.get(id) ?? !!nodes.find((n) => n.id === id)?.data.collapsed),
    [mind, ownFolds, nodes]
  );
  const shownNodes = useMemo(
    () =>
      nodes.map((n) =>
        hidden.has(n.id) || pageOf(n) !== page ? (n.hidden ? n : { ...n, hidden: true }) : n
      ),
    [nodes, hidden, page]
  );
  /** Brings a shape into view if it's off the screen. */
  const reveal = (id: string) =>
    setTimeout(() => {
      const n = current.current.nodes.find((x) => x.id === id);
      const box = wrapper.current?.getBoundingClientRect();
      if (!n || !box) return;
      const a = flow.flowToScreenPosition(n.position);
      const b = flow.flowToScreenPosition({
        x: n.position.x + (n.width ?? 150),
        y: n.position.y + (n.height ?? 52),
      });
      if (a.x < box.left + 20 || a.y < box.top + 20 || b.x > box.right - 20 || b.y > box.bottom - 20)
        void flow.setCenter(
          (n.position.x * 2 + (n.width ?? 150)) / 2,
          (n.position.y * 2 + (n.height ?? 52)) / 2,
          {
            zoom: flow.getZoom(),
            duration: 250,
          }
        );
    }, 40);
  const mindAct = (id: string, action: MindAction, label?: string) => {
    if (action === "fold" && !canEdit) {
      setOwnFolds((prev) => new Map(prev).set(id, !folded(id)));
      return;
    }
    if (!canEdit) return;
    let ns = current.current.nodes;
    let es = current.current.edges;
    if (label !== undefined) ns = ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n));
    if (action === "fold") {
      ns = ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, collapsed: !folded(id) } } : n));
      setOwnFolds((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
    const isFolded = (k: string) =>
      k === id && action === "fold"
        ? !folded(id)
        : (ownFolds.get(k) ?? !!ns.find((n) => n.id === k)?.data.collapsed);
    const tree = mindTree(ns, es);
    let focus = id;
    if (action === "child" || action === "sibling") {
      const parent = action === "sibling" ? tree.parent.get(id) : id;
      const added = addIdea(ns, es, parent ?? id, isFolded, action === "sibling" && parent ? id : undefined);
      ns = added.nodes.map((n) => (n.id === added.id ? { ...n, data: onPage(n.data, page) } : n));
      es = added.edges;
      focus = added.id;
    } else {
      const laid = mindLayout(ns, es, rootOf(tree, id), isFolded);
      ns = laid.nodes;
      es = laid.edges;
    }
    const adding = action === "child" || action === "sibling";
    replace(
      ns.map((n) => (n.selected === (n.id === focus) ? n : { ...n, selected: n.id === focus })),
      es.map((e) => (e.selected ? { ...e, selected: false } : e))
    );
    if (adding) {
      setEditingId(focus);
      reveal(focus);
    }
  };
  /** Deleting an idea takes the ideas under it too. */
  const onBeforeDelete = async ({
    nodes: gone,
    edges: goneEdges,
  }: {
    nodes: ShapeNode[];
    edges: LineEdge[];
  }) => {
    const ids = new Set(gone.map((n) => n.id));
    for (const n of gone) if (n.data.shape === "mind") branchOf(mind, n.id).forEach((k) => ids.add(k));
    if (ids.size === gone.length) return true;
    const lines = new Set(goneEdges.map((e) => e.id));
    return {
      nodes: current.current.nodes.filter((n) => ids.has(n.id)),
      edges: current.current.edges.filter((e) => lines.has(e.id) || ids.has(e.source) || ids.has(e.target)),
    };
  };
  const soloIdea =
    selectedNodes.length === 1 && selectedNodes[0].data.shape === "mind" ? selectedNodes[0] : null;

  // AI: what it drew goes to the right of what's on this page; a suggested step goes after its shape -----------
  const addDrawing = (graph: AiGraph) => {
    if (!canEdit) return;
    const here = current.current.nodes.filter((n) => pageOf(n) === page);
    const at = here.length
      ? {
          x: Math.round(Math.max(...here.map((n) => n.position.x + (n.width ?? 160))) + 120),
          y: Math.round(Math.min(...here.map((n) => n.position.y))),
        }
      : { x: 0, y: 0 };
    const drawn = graphShapes(graph, at, page === FIRST_PAGE ? undefined : page);
    replace(
      [...current.current.nodes.map((n) => ({ ...n, selected: false })), ...drawn.nodes],
      [...current.current.edges.map((e) => ({ ...e, selected: false })), ...drawn.edges]
    );
    toast.success(`Drawn: ${drawn.nodes.length} shapes`);
    setTimeout(() => void flow.fitView({ nodes: drawn.nodes, padding: 0.15, duration: 400, maxZoom: 1 }), 80);
  };
  const addStep = (s: AiSuggestion) => {
    if (!canEdit) return;
    const after = s.after ? current.current.nodes.find((n) => n.id === s.after) : null;
    const item = SHAPES.find((x) => x.key === "process")!;
    if (!after) {
      addShape(item, undefined, { label: s.label });
      return;
    }
    const w = item.w;
    const spot = {
      x: after.position.x + (after.width ?? 160) / 2 - w / 2,
      y: after.position.y + (after.height ?? 64) + 70,
    };
    // step aside while something is already there
    const taken = (x: number, y: number) =>
      current.current.nodes.some(
        (n) =>
          pageOf(n) === page &&
          x < n.position.x + (n.width ?? 160) &&
          x + w > n.position.x &&
          y < n.position.y + (n.height ?? 64) &&
          y + item.h > n.position.y
      );
    for (let i = 0; i < 20 && taken(spot.x, spot.y); i++) spot.x += w + 40;
    const id = newId("n");
    const node: ShapeNode = {
      id,
      type: "shape",
      position: spot,
      width: w,
      height: item.h,
      zIndex: 0,
      data: onPage(
        { ...defaultData("process", s.label), fill: "#fef9c3", stroke: "#eab308", text: "#713f12" },
        page
      ),
      selected: true,
    };
    const edge = toEdge({
      id: newId("e"),
      source: after.id,
      target: id,
      sourceHandle: "b",
      targetHandle: "t",
      type: "line",
      data: { dashed: true },
    });
    replace(
      [...current.current.nodes.map((n) => ({ ...n, selected: false })), node],
      [...current.current.edges, edge]
    );
    setTimeout(
      () => void flow.fitView({ nodes: [after, node], padding: 0.6, duration: 300, maxZoom: 1.1 }),
      60
    );
  };

  // chatbots: this page's flow becomes a draft chatbot; a chatbot's flow is drawn here ----------------------------
  const [botDialog, setBotDialog] = useState<{ draft: ChatbotDraft | null; error: string | null } | null>(
    null
  );
  const [botPicker, setBotPicker] = useState(false);
  const openBotDialog = () => {
    try {
      const here = current.current.nodes.filter((n) => pageOf(n) === page && !hidden.has(n.id));
      setBotDialog({ draft: toChatbot(here, current.current.edges), error: null });
    } catch (err) {
      setBotDialog({ draft: null, error: (err as Error).message });
    }
  };

  // pages --------------------------------------------------------------------------------------------------------
  const goToPage = (id: string) => {
    setPageId(id);
    setEditingId(null);
    setDraftPin(null);
    setFollowing(null);
    select(new Set());
    try {
      const url = new URL(window.location.href);
      if (id === pages[0].id) url.searchParams.delete("page");
      else url.searchParams.set("page", id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* the address just doesn't follow */
    }
    setTimeout(() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 60);
  };
  const savePages = (next: Page[]) => {
    if (!props.savePages || !canEdit) return;
    setPagesDraft(next);
    props.savePages(next).catch((err: Error) => {
      setPagesDraft(null);
      toast.error(errorMessage(err));
    });
  };
  const addPage = () => {
    const used = new Set(pages.map((p) => p.name));
    let n = pages.length + 1;
    while (used.has(`Page ${n}`)) n++;
    const id = newId("p").slice(0, 20);
    savePages([...pages, { id, name: `Page ${n}` }]);
    goToPage(id);
  };
  const pageAction = async (id: string, action: PageAction) => {
    const at = pages.findIndex((p) => p.id === id);
    const it = pages[at];
    if (!it) return;
    if (action === "link") {
      const url = new URL(window.location.href);
      url.search = "";
      if (at > 0) url.searchParams.set("page", id);
      try {
        await navigator.clipboard.writeText(url.toString());
        toast.success("Link to this page copied");
      } catch {
        toast.error("Couldn't copy the link");
      }
      return;
    }
    if (!canEdit) return;
    if (action === "left" || action === "right") {
      const to = action === "left" ? at - 1 : at + 1;
      const next = [...pages];
      [next[at], next[to]] = [next[to], next[at]];
      savePages(next);
      return;
    }
    const onIt = current.current.nodes.filter((n) => pageOf(n) === id);
    const ids = new Set(onIt.map((n) => n.id));
    if (action === "duplicate") {
      const copyId = newId("p").slice(0, 20);
      const map = new Map(onIt.map((n) => [n.id, newId("n")]));
      const copies = onIt.map((n) => ({
        ...n,
        id: map.get(n.id)!,
        selected: false,
        data: onPage(n.data, copyId),
      }));
      const lines = current.current.edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => ({
          ...e,
          id: newId("e"),
          source: map.get(e.source)!,
          target: map.get(e.target)!,
          selected: false,
        }));
      replace([...current.current.nodes, ...copies], [...current.current.edges, ...lines]);
      const next = [...pages];
      next.splice(at + 1, 0, { id: copyId, name: `${it.name} (copy)`.slice(0, 60) });
      savePages(next);
      goToPage(copyId);
      return;
    }
    if (action === "delete") {
      if (pages.length < 2) return;
      if (props.confirmDeletePage && !(await props.confirmDeletePage(it.name))) return;
      replace(
        current.current.nodes.filter((n) => !ids.has(n.id)),
        current.current.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target))
      );
      const next = pages.filter((p) => p.id !== id);
      savePages(next);
      if (page === id) goToPage(next[Math.max(0, at - 1)].id);
    }
  };

  // keyboard ---------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || editingId) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (key === "escape") {
        setCommentMode(false);
        setDraftPin(null);
        select(new Set());
        return;
      }
      if (!canEdit) return;
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (mod && key === "c") {
        copySelection();
      } else if (mod && key === "x") {
        if (copySelection()) arrange("delete");
      } else if (mod && key === "v") {
        e.preventDefault();
        paste();
      } else if (mod && key === "d") {
        e.preventDefault();
        arrange("duplicate");
      } else if (mod && key === "a") {
        e.preventDefault();
        select(new Set(current.current.nodes.filter((n) => pageOf(n) === page).map((n) => n.id)));
      } else if ((key === "tab" || key === "enter") && soloIdea && !mod && !e.shiftKey) {
        e.preventDefault();
        mindAct(soloIdea.id, key === "tab" ? "child" : "sibling");
      } else if (
        (key === "enter" || key === "f2") &&
        current.current.nodes.filter((n) => n.selected).length === 1
      ) {
        e.preventDefault();
        arrange("edit-text");
      } else if (key.startsWith("arrow")) {
        const step = e.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        if (!current.current.nodes.some((n) => n.selected)) return;
        e.preventDefault();
        replace(
          current.current.nodes.map((n) =>
            n.selected && !n.data.locked
              ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
              : n
          )
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // presence -------------------------------------------------------------------------------------------------------
  const wrapper = useRef<HTMLDivElement>(null);
  const peers = [...live.peers.values()];

  // follow mode: my screen shows what someone else is looking at --------------------------------------------
  const [following, setFollowing] = useState<string | null>(null);
  const followed = following ? (live.peers.get(following) ?? null) : null;
  const followView = followed?.view;
  useEffect(() => {
    if (!following) return;
    if (!live.peers.has(following)) {
      setFollowing(null);
      return;
    }
    if (followView?.page && followView.page !== page) setPageId(followView.page); // eslint-disable-line react-hooks/set-state-in-effect -- they went to another page
    if (followView) void flow.setCenter(followView.x, followView.y, { zoom: followView.zoom, duration: 250 });
  }, [following, followView, live.peers, flow, page]);

  // presentation: frames are the slides (top to bottom, left to right); no frames = the whole diagram -------
  const root = useRef<HTMLDivElement>(null);
  const slides = useMemo(() => {
    const frames = nodes.filter((n) => n.data.shape === "frame" && pageOf(n) === page);
    const rowOf = (n: ShapeNode) => Math.round(n.position.y / 200);
    return frames.sort((a, b) => rowOf(a) - rowOf(b) || a.position.x - b.position.x);
  }, [nodes, page]);
  const slideCount = Math.max(1, slides.length);
  const present = (index: number) => {
    const i = Math.max(0, Math.min(slideCount - 1, index));
    setPresenting(i);
    setFollowing(null);
    setPanel(null);
    setCommentMode(false);
    if (presenting === null && root.current && !document.fullscreenElement) {
      void root.current.requestFullscreen?.().catch(() => null);
    }
    setTimeout(() => {
      const slide = slides[i];
      if (slide) {
        void flow.fitBounds(
          {
            x: slide.position.x,
            y: slide.position.y,
            width: slide.width ?? 420,
            height: slide.height ?? 280,
          },
          { padding: 0.04, duration: 450 }
        );
      } else void flow.fitView({ padding: 0.08, duration: 450 });
    }, 60);
  };
  const stopPresenting = () => {
    setPresenting(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => null);
  };
  useEffect(() => {
    if (presenting === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        present(presenting + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        present(presenting - 1);
      } else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        stopPresenting();
      }
    };
    const onFull = () => {
      if (!document.fullscreenElement) setPresenting(null);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFull);
    };
  });
  const peerSelection = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of live.peers.values())
      for (const id of p.selection ?? []) map.set(id, [...(map.get(id) ?? []), p.person.color]);
    return map;
  }, [live.peers]);

  // comments --------------------------------------------------------------------------------------------------------
  const list = useMemo(() => threads(comments?.list ?? []), [comments?.list]);
  const commentCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of list)
      if (t.root.node_id && !t.root.resolved)
        map.set(t.root.node_id, (map.get(t.root.node_id) ?? 0) + 1 + t.replies.length);
    return map;
  }, [list]);
  const threadPage = (root: Comment) => {
    const n = root.node_id ? nodes.find((x) => x.id === root.node_id) : null;
    return n ? pageOf(n) : (root.page ?? FIRST_PAGE);
  };
  const pageThreads = list.filter((t) => threadPage(t.root) === page);
  const openThread = (id: number) => {
    setActiveThread(id);
    setPanel("comments");
    const t = list.find((x) => x.root.id === id);
    if (t && threadPage(t.root) !== page) setPageId(threadPage(t.root));
    const at = t && pinAt(t.root, new Map(current.current.nodes.map((n) => [n.id, n])));
    if (at)
      setTimeout(
        () => flow.setCenter(at.x, at.y, { zoom: Math.max(flow.getZoom(), 0.8), duration: 300 }),
        30
      );
  };
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !props.focusComment || !list.length) return;
    opened.current = true;
    openThread(props.focusComment);
  });

  const myVoteKey = props.me.id ? `m:${props.me.id}` : null;
  const votes = useMemo(() => {
    const voting = liveState?.session.voting;
    if (!voting) return undefined;
    const counts = new Map(Object.entries(voting.votes).map(([id, v]) => [id, v.length]));
    const mine = new Set(
      Object.entries(voting.votes)
        .filter(([, v]) => myVoteKey && v.includes(myVoteKey))
        .map(([id]) => id)
    );
    const vote = props.workshop?.vote;
    return {
      open: voting.open,
      canVote: !!vote && !props.me.guest && !previewing,
      counts,
      mine,
      onVote: (id: string) => {
        void vote?.(id, !mine.has(id)).catch((err: Error) => toast.error(errorMessage(err)));
      },
    };
  }, [liveState, myVoteKey, props.workshop?.vote, props.me.guest, previewing]);
  // shapes ask for mind map changes through events, so the context (and every shape) stays the same between renders
  const [mindEvents] = useState(() => new EventTarget());
  useEffect(() => {
    const on = (e: Event) => {
      const { id, action, label } = (e as CustomEvent<{ id: string; action: MindAction; label?: string }>)
        .detail;
      mindAct(id, action, label);
    };
    mindEvents.addEventListener("act", on);
    return () => mindEvents.removeEventListener("act", on);
  });
  const ctx = useMemo(
    () => ({
      editable: canEdit,
      editingId,
      setEditingId,
      peerSelection,
      commentCount,
      votes,
      records: { cards, canOpen: !!props.records?.canOpen },
      mind: {
        kids: new Map([...mind.kids].map(([id, k]) => [id, k.length])),
        side: mind.side,
        folded,
        act: (id: string, action: MindAction, label?: string) =>
          void mindEvents.dispatchEvent(new CustomEvent("act", { detail: { id, action, label } })),
      },
    }),
    [
      canEdit,
      editingId,
      peerSelection,
      commentCount,
      votes,
      mind,
      folded,
      cards,
      props.records?.canOpen,
      mindEvents,
    ]
  );

  const shown = useMemo(() => (props.preview ? fromContent(props.preview.content) : null), [props.preview]);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const hand = tool === "hand" || (touch && tool !== "select");
  const empty = !nodes.length && !shown;
  const unsaved = saving > 0;

  const [exporting, setExporting] = useState(false);
  const exportAs = async (format: "png" | "svg" | "pdf") => {
    // what's on screen (or the version being looked at), without selection or anyone's cursor
    const picked = shown
      ? { nodes: shown.nodes.filter((n) => pageOf(n) === page), edges: shown.edges }
      : { nodes: nodes.filter((n) => !hidden.has(n.id) && pageOf(n) === page), edges };
    // live cards are drawn as they are right now
    const source = {
      ...picked,
      nodes: picked.nodes.map((n) =>
        n.data.record ? { ...n, data: { ...n.data, card: cards.get(recordKey(n.data.record)) } } : n
      ),
    };
    setExporting(true);
    try {
      const save = format === "pdf" ? downloadPdf : format === "svg" ? downloadSvg : downloadPng;
      const here = pages.length > 1 ? ` - ${pages.find((p) => p.id === page)?.name ?? ""}` : "";
      await save(
        source.nodes,
        source.edges,
        props.preview ? `${name}${here} (${props.preview.label})` : `${name}${here}`
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const statusChip = (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium sm:inline-flex",
        live.status === "live"
          ? "text-emerald-700 dark:text-emerald-400"
          : live.status === "closed"
            ? "text-danger"
            : "text-amber-700 dark:text-amber-400"
      )}
      title={
        live.status === "live"
          ? "Changes show for everyone instantly"
          : live.status === "polling"
            ? "No live connection: changes are sent and fetched every few seconds"
            : undefined
      }
    >
      {live.status === "live" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {live.status === "live"
        ? unsaved
          ? "Saving…"
          : "Live"
        : live.status === "polling"
          ? "Every few seconds"
          : live.status === "closed"
            ? "Closed"
            : "Connecting…"}
    </span>
  );

  return (
    <EditorContext.Provider value={ctx}>
      <div
        ref={root}
        className={cn(
          "bg-page relative flex h-full min-h-0 flex-col",
          presenting !== null && "fixed inset-0 z-[70] h-dvh"
        )}
      >
        {/* top bar */}
        <div
          className={cn(
            "border-line bg-surface flex items-center gap-1.5 border-b px-2 py-1.5 sm:gap-2 sm:px-3",
            presenting !== null && "hidden"
          )}
        >
          {props.title({ name, canEdit, status: live.status })}
          {statusChip}
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <span className="hidden sm:block">
              <Avatars
                me={props.me}
                peers={peers}
                following={following}
                onFollow={(peerId) => {
                  setFollowing(peerId === following ? null : peerId);
                  setPresenting(null);
                }}
              />
            </span>
            {canEdit && (
              <span className="hidden items-center md:flex">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Undo2}
                  aria-label="Undo"
                  title="Undo (Ctrl+Z)"
                  onClick={undo}
                  disabled={!steps.undo}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Redo2}
                  aria-label="Redo"
                  title="Redo (Ctrl+Shift+Z)"
                  onClick={redo}
                  disabled={!steps.redo}
                />
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              leftIcon={Presentation}
              aria-label="Present"
              title="Present (frames are slides)"
              onClick={() => present(0)}
            />
            {props.ai && !previewing && (
              <Button
                size="sm"
                variant={panel === "ai" ? "secondary" : "ghost"}
                iconOnly
                leftIcon={Sparkles}
                aria-label="AI"
                title="AI: draw from a description, explain, find missing steps"
                onClick={() => setPanel(panel === "ai" ? null : "ai")}
              />
            )}
            {props.workshop && (
              <Button
                size="sm"
                variant={panel === "workshop" ? "secondary" : "ghost"}
                iconOnly
                leftIcon={TimerIcon}
                aria-label="Workshop"
                title="Workshop: timer and voting"
                onClick={() => setPanel(panel === "workshop" ? null : "workshop")}
              />
            )}
            {comments && (
              <Button
                size="sm"
                variant={panel === "comments" ? "secondary" : "ghost"}
                leftIcon={MessageSquare}
                aria-label="Comments"
                onClick={() => {
                  if (panel !== "comments") props.onCommenting?.();
                  setPanel(panel === "comments" ? null : "comments");
                }}
              >
                <span className="hidden lg:inline">Comments</span>
                {list.filter((t) => !t.root.resolved).length > 0 && (
                  <span className="bg-primary text-primary-fg rounded-full px-1.5 text-[10px] font-bold">
                    {list.filter((t) => !t.root.resolved).length}
                  </span>
                )}
              </Button>
            )}
            {props.sidePanel && (
              <Button
                size="sm"
                variant={panel === "extra" ? "secondary" : "ghost"}
                iconOnly
                leftIcon={props.sidePanel.icon}
                aria-label={props.sidePanel.label}
                title={props.sidePanel.label}
                onClick={() => setPanel(panel === "extra" ? null : "extra")}
              />
            )}
            <Dropdown
              align="right"
              width="w-52"
              trigger={() => (
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Download}
                  aria-label="Download"
                  title="Download"
                />
              )}
              items={[
                { label: "PNG image", icon: FileImage, onClick: () => void exportAs("png") },
                { label: "SVG (sharp at any size)", icon: FileImage, onClick: () => void exportAs("svg") },
                { label: "PDF document", icon: FileText, onClick: () => void exportAs("pdf") },
              ]}
            />
            {props.actions}
            {(props.menu?.length || canEdit || props.chatbot) && (
              <Dropdown
                align="right"
                width="w-56"
                trigger={() => (
                  <Button size="sm" variant="ghost" iconOnly leftIcon={MoreHorizontal} aria-label="More" />
                )}
                items={[
                  {
                    label: "Tidy up, top to bottom",
                    icon: Workflow,
                    hidden: !canEdit,
                    onClick: () => tidy("TB"),
                  },
                  {
                    label: "Tidy up, left to right",
                    icon: Workflow,
                    hidden: !canEdit,
                    onClick: () => tidy("LR"),
                  },
                  {
                    label: "Turn into a chatbot…",
                    icon: Bot,
                    hidden: !props.chatbot || previewing,
                    onClick: openBotDialog,
                  },
                  {
                    label: "Draw a chatbot's flow…",
                    icon: Bot,
                    hidden: !props.chatbot || !canEdit || !props.records?.search,
                    onClick: () => setBotPicker(true),
                  },
                  ...(props.menu ?? []),
                ]}
              />
            )}
          </div>
        </div>

        {props.banner}
        {followed && (
          <div
            className="flex items-center gap-2 border-b px-4 py-1.5 text-sm font-medium text-white"
            style={{ background: followed.person.color }}
          >
            Following {followed.person.name}. Move around yourself to stop.
            <button
              type="button"
              className="ml-auto rounded px-2 py-0.5 text-xs underline"
              onClick={() => setFollowing(null)}
            >
              Stop following
            </button>
          </div>
        )}
        {closed && (
          <div className="border-danger/30 bg-danger-soft text-danger flex items-center gap-2 border-b px-4 py-2 text-sm">
            <CircleAlert className="h-4 w-4 shrink-0" /> {closed}
          </div>
        )}
        {props.preview && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Looking at an earlier version: <b>{props.preview.label}</b>. Nothing changes until you restore
              it.
            </span>
            <Button size="sm" variant="secondary" onClick={props.preview.onExit}>
              Back to now
            </Button>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1">
          {canEdit && (
            <aside
              className="border-line bg-surface hidden w-[11.5rem] shrink-0 overflow-y-auto border-r lg:block"
              aria-label="Shapes"
            >
              <Palette onAdd={(item) => addShape(item)} />
            </aside>
          )}

          <div
            ref={wrapper}
            className={cn(
              "diagram-canvas relative min-w-0 flex-1",
              commentMode && "cursor-crosshair [&_.react-flow__pane]:!cursor-crosshair"
            )}
            onPointerMove={(e) => {
              if (!live || closed) return;
              live.setPresence({ cursor: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
            }}
            onPointerLeave={() => live.setPresence({ cursor: null })}
            onDragOver={(e) => {
              if (
                canEdit &&
                (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes("Files"))
              ) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
              const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
              if (file) {
                e.preventDefault();
                void addPicture(file, { mode: "add", at });
                return;
              }
              const item = SHAPES.find((x) => x.key === e.dataTransfer.getData(DRAG_TYPE));
              if (!item) return;
              e.preventDefault();
              addShape(item, at);
            }}
          >
            <ReactFlow<ShapeNode, LineEdge>
              nodes={shown ? shown.nodes : shownNodes}
              edges={shown ? shown.edges : edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={onBeforeDelete}
              onReconnect={canEdit ? onReconnect : undefined}
              edgesReconnectable={canEdit}
              connectionMode={ConnectionMode.Loose}
              nodesDraggable={canEdit && !commentMode}
              nodesConnectable={canEdit && !commentMode}
              elementsSelectable={!commentMode}
              deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
              selectionOnDrag={!hand && !commentMode}
              panOnDrag={hand || commentMode ? true : [1, 2]}
              panOnScroll={!touch}
              zoomOnScroll={touch}
              zoomOnPinch
              selectionKeyCode={null}
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              snapToGrid
              snapGrid={[8, 8]}
              minZoom={0.1}
              maxZoom={3}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              colorMode={dark ? "dark" : "light"}
              proOptions={{ hideAttribution: true }}
              connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2 }}
              onNodeDragStart={(_, node, dragged) => {
                interacting.current = true;
                dragging.current = new Set((dragged.length ? dragged : [node]).map((n) => n.id));
              }}
              onNodeDrag={(_, node, dragged) =>
                live.setPresence({
                  drag: Object.fromEntries(
                    (dragged.length ? dragged : [node]).map((n) => [n.id, n.position])
                  ),
                })
              }
              onNodeDragStop={() => {
                interacting.current = false;
                dragging.current = new Set();
                live.setPresence({ drag: null });
                commit();
              }}
              onSelectionChange={({ nodes: sel }) => live.setPresence({ selection: sel.map((n) => n.id) })}
              onMoveStart={(event) => {
                if (event && following) setFollowing(null); // they moved the view themselves
              }}
              onMove={(_, vp) => {
                const box = wrapper.current?.getBoundingClientRect();
                if (!box) return;
                live.setPresence({
                  view: {
                    x: (box.width / 2 - vp.x) / vp.zoom,
                    y: (box.height / 2 - vp.y) / vp.zoom,
                    zoom: vp.zoom,
                    page,
                  },
                });
              }}
              onNodeClick={(e, node) => {
                if (commentMode && canComment) {
                  e.stopPropagation();
                  setDraftPin({ x: node.position.x, y: node.position.y, node_id: node.id });
                }
              }}
              onPaneClick={(e) => {
                setEditingId(null);
                if (commentMode && canComment)
                  setDraftPin(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
                else setDraftPin(null);
              }}
              onEdgeDoubleClick={(_, edge) => canEdit && setEditingId(`edge:${edge.id}`)}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} />
              <Controls showInteractive={false} position="bottom-right" />
              <MiniMap
                pannable
                zoomable
                position="bottom-left"
                className="!hidden xl:!block"
                nodeColor={(n) => ((n.data as ShapeData).fill as string) ?? "#cbd5e1"}
                nodeStrokeColor={(n) => ((n.data as ShapeData).stroke as string) ?? "#64748b"}
                maskColor={dark ? "rgba(15,23,42,0.6)" : "rgba(241,245,249,0.6)"}
              />
              <Cursors peers={peers.filter((p) => (p.view?.page ?? FIRST_PAGE) === page)} nodes={nodes} />
              {comments && !shown && (
                <CommentPins
                  list={pageThreads}
                  nodes={nodes}
                  active={activeThread}
                  onOpen={openThread}
                  draft={draftPin && !draftPin.node_id ? draftPin : null}
                  onDraftCancel={() => setDraftPin(null)}
                  people={props.people}
                  onDraftSave={async (body, mentions) => {
                    await comments.add({
                      body,
                      x: draftPin!.x,
                      y: draftPin!.y,
                      mentions,
                      page: page === FIRST_PAGE ? null : page,
                    });
                    setDraftPin(null);
                    setCommentMode(false);
                    setPanel("comments");
                  }}
                />
              )}
            </ReactFlow>

            {/* tools floating on the canvas */}
            <div
              hidden={presenting !== null}
              className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 gap-1"
            >
              <div className="border-line bg-surface pointer-events-auto flex items-center gap-0.5 rounded-xl border p-1 shadow-md">
                <Button
                  size="sm"
                  variant={!hand && !commentMode ? "secondary" : "ghost"}
                  iconOnly
                  leftIcon={MousePointer2}
                  aria-label="Select"
                  title="Select (drag on empty space to select many)"
                  onClick={() => {
                    setTool("select");
                    setCommentMode(false);
                  }}
                />
                <Button
                  size="sm"
                  variant={hand && !commentMode ? "secondary" : "ghost"}
                  iconOnly
                  leftIcon={Hand}
                  aria-label="Move around"
                  title="Move around"
                  onClick={() => {
                    setTool("hand");
                    setCommentMode(false);
                  }}
                />
                {canComment && (
                  <Button
                    size="sm"
                    variant={commentMode ? "secondary" : "ghost"}
                    iconOnly
                    leftIcon={MessageSquarePlus}
                    aria-label="Add a comment"
                    title="Add a comment: click anywhere, or on a shape"
                    onClick={() => {
                      if (!commentMode) props.onCommenting?.();
                      setCommentMode((v) => !v);
                      setDraftPin(null);
                    }}
                  />
                )}
                {canEdit && (
                  <span className="lg:hidden">
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leftIcon={Plus}
                      aria-label="Add a shape"
                      onClick={() => setSheet("shapes")}
                    />
                  </span>
                )}
                {canEdit && (selectedNodes.length > 0 || selectedEdges.length > 0) && (
                  <span className="xl:hidden">
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leftIcon={PaletteIcon}
                      aria-label="Style"
                      onClick={() => setSheet("style")}
                    />
                  </span>
                )}
                {canEdit && (
                  <span className="md:hidden">
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leftIcon={Undo2}
                      aria-label="Undo"
                      onClick={undo}
                    />
                  </span>
                )}
              </div>
            </div>
            {liveState && <TimerPill timer={liveState.session.timer} endsAt={timerEnds} />}
            {canEdit && soloIdea && presenting === null && (
              <p
                role="note"
                className="border-line bg-surface/95 text-fg-subtle pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 rounded-full border px-3.5 py-1.5 text-xs shadow-sm sm:flex"
              >
                {(editingId === soloIdea.id
                  ? [
                      ["Tab", "idea under it"],
                      ["Enter", "idea next to it"],
                      ["Esc", "done"],
                    ]
                  : [
                      ["Tab", "idea under it"],
                      ["Enter", "idea next to it"],
                      ["F2", "rename"],
                      ["Del", "remove branch"],
                    ]
                ).map(([k, what]) => (
                  <span key={k} className="flex items-center gap-1 whitespace-nowrap">
                    <kbd className="border-line bg-page text-fg rounded border px-1.5 py-px font-sans text-[11px] font-semibold">
                      {k}
                    </kbd>
                    {what}
                  </span>
                ))}
              </p>
            )}
            {presenting !== null && (
              <div className="bg-fg/90 text-page absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1.5 shadow-lg">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() => present(presenting - 1)}
                  disabled={presenting === 0}
                  className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-20 text-center text-sm font-medium tabular-nums">
                  {slides[presenting]?.data.label || (slides.length ? "Slide" : "Whole diagram")} ·{" "}
                  {presenting + 1}/{slideCount}
                </span>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => present(presenting + 1)}
                  disabled={presenting >= slideCount - 1}
                  className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Stop presenting"
                  onClick={stopPresenting}
                  className="ml-1 rounded-full p-1.5 hover:bg-white/15"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {commentMode && (
              <p className="bg-fg text-page pointer-events-none absolute top-16 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow">
                Click where the comment goes · Esc to stop
              </p>
            )}

            {draftPin?.node_id && comments && (
              <NodeCommentBox
                people={props.people}
                onCancel={() => setDraftPin(null)}
                onSave={async (body, mentions) => {
                  await comments.add({ body, node_id: draftPin.node_id, mentions });
                  setDraftPin(null);
                  setCommentMode(false);
                  setPanel("comments");
                }}
              />
            )}

            {empty && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="text-fg-subtle max-w-xs text-center text-sm">
                  <p className="text-fg mb-1 font-semibold">
                    {canEdit ? "An empty canvas" : "Nothing here yet"}
                  </p>
                  {canEdit
                    ? "Click a shape on the left (or + on a phone) to start. Drag from a shape's edge dot to connect it to another."
                    : "Shapes appear here as soon as someone adds them."}
                </div>
              </div>
            )}
          </div>

          {/* style panel (wide screens) */}
          {canEdit && (selectedNodes.length > 0 || selectedEdges.length > 0) && !panel && (
            <aside className="border-line bg-surface hidden w-64 shrink-0 overflow-y-auto border-l xl:block">
              <Inspector
                nodes={selectedNodes}
                edges={selectedEdges}
                onNodeData={patchNodes}
                onEdgeData={patchEdges}
                onArrange={arrange}
              />
            </aside>
          )}

          {panel && (
            <aside className="border-line bg-surface absolute inset-0 z-20 flex w-full shrink-0 flex-col border-l sm:static sm:w-80">
              {panel === "comments" && comments ? (
                <CommentsPanel
                  list={list}
                  active={activeThread}
                  onOpen={openThread}
                  canComment={canComment}
                  canDelete={comments.canDelete}
                  onReply={comments.add}
                  onResolve={comments.resolve}
                  onDelete={comments.remove}
                  onTask={comments.setTask}
                  onClose={() => setPanel(null)}
                  people={props.people}
                  hint={
                    canComment
                      ? "Click the speech bubble above the canvas, then click where the comment goes."
                      : "No comments yet."
                  }
                />
              ) : panel === "workshop" && props.workshop && liveState ? (
                <WorkshopPanel
                  state={liveState}
                  endsAt={timerEnds}
                  me={myVoteKey}
                  canRun={props.workshop.canRun}
                  canVote={!props.me.guest}
                  labelOf={(id) => {
                    const n = nodes.find((x) => x.id === id);
                    return n ? n.data.label || "" : null;
                  }}
                  onFocus={(id) => {
                    const n = nodes.find((x) => x.id === id);
                    if (n) flow.fitView({ nodes: [n], padding: 1.2, duration: 300, maxZoom: 1.2 });
                  }}
                  onTimer={props.workshop.timer}
                  onVoting={props.workshop.voting}
                  onClose={() => setPanel(null)}
                />
              ) : panel === "ai" && props.ai ? (
                <AiPanel
                  ai={props.ai}
                  canEdit={canEdit}
                  labelOf={(id) => {
                    const n = nodes.find((x) => x.id === id);
                    return n ? n.data.label || "" : null;
                  }}
                  onFocus={(id) => {
                    const n = nodes.find((x) => x.id === id);
                    if (n) flow.fitView({ nodes: [n], padding: 1.2, duration: 300, maxZoom: 1.2 });
                  }}
                  onDrawn={addDrawing}
                  onAddStep={addStep}
                  onClose={() => setPanel(null)}
                />
              ) : panel === "extra" && props.sidePanel ? (
                props.sidePanel.render(() => setPanel(null))
              ) : null}
            </aside>
          )}
        </div>

        {presenting === null && !shown && (canEdit ? !!props.savePages : pages.length > 1) && (
          <PageTabs
            pages={pages}
            current={page}
            canEdit={canEdit && !!props.savePages}
            onPick={goToPage}
            onAdd={addPage}
            onRename={(id, nextName) =>
              savePages(pages.map((p) => (p.id === id ? { ...p, name: nextName } : p)))
            }
            onAction={(id, action) => void pageAction(id, action)}
          />
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          aria-label="Picture to add"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void addPicture(file, imageAt.current);
          }}
        />
        {exporting && (
          <p
            role="status"
            className="bg-fg text-page absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow"
          >
            Preparing the download…
          </p>
        )}
        {uploading && (
          <p className="bg-fg text-page absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow">
            Uploading picture…
          </p>
        )}
        {botDialog && props.chatbot && (
          <ChatbotDialog
            draft={botDialog.draft}
            error={botDialog.error}
            name={pages.length > 1 ? `${name} - ${pages.find((p) => p.id === page)?.name ?? ""}` : name}
            onClose={() => setBotDialog(null)}
            onMake={async (botName, draft) => {
              await props.chatbot!.make(botName, draft.graph);
              setBotDialog(null);
            }}
          />
        )}
        {botPicker && props.chatbot && props.records?.search && (
          <RecordPicker
            type="chatbot"
            only={["chatbot"]}
            title="Draw a chatbot's flow"
            search={props.records.search}
            onClose={() => setBotPicker(false)}
            onPick={async (_, hit) => {
              setBotPicker(false);
              try {
                const bot = await props.chatbot!.load(hit.id);
                addDrawing(fromChatbot(bot.name, bot.graph));
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        )}
        {recordFor && props.records?.search && (
          <RecordPicker
            type={recordFor.type}
            search={props.records.search}
            onClose={() => setRecordFor(null)}
            onPick={(type, hit) => {
              const item = SHAPES.find((x) => x.key === `record:${type}`)!;
              addShape(item, recordFor.at, { record: { type, id: hit.id } });
              setRecordFor(null);
            }}
          />
        )}
        {iconFor && (
          <IconPicker
            open
            onClose={() => setIconFor(null)}
            onPick={(name) => {
              if (iconFor.mode === "replace") {
                replace(
                  current.current.nodes.map((n) =>
                    n.selected && n.data.shape === "icon" ? { ...n, data: { ...n.data, icon: name } } : n
                  )
                );
              } else {
                const item = SHAPES.find((x) => x.key === "icon:pick")!;
                addShape(item, iconFor.at, {
                  icon: name,
                  label: name.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
                });
              }
              setIconFor(null);
            }}
          />
        )}

        {/* phone sheets */}
        {sheet && (
          <div
            className="fixed inset-0 z-40 flex flex-col justify-end bg-black/30 xl:hidden"
            onClick={() => setSheet(null)}
          >
            <div
              className="bg-surface max-h-[70dvh] overflow-y-auto rounded-t-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={sheet === "shapes" ? "Add a shape" : "Style"}
            >
              <div className="bg-line mx-auto mt-2 h-1 w-10 rounded-full" />
              {sheet === "shapes" ? (
                <Palette compact onAdd={(item) => addShape(item)} />
              ) : (
                <Inspector
                  nodes={selectedNodes}
                  edges={selectedEdges}
                  onNodeData={patchNodes}
                  onEdgeData={patchEdges}
                  onArrange={(a) => {
                    arrange(a);
                    if (a === "delete" || a === "edit-text") setSheet(null);
                  }}
                  onClose={() => setSheet(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </EditorContext.Provider>
  );
}

function NodeCommentBox({
  onCancel,
  onSave,
  people,
}: {
  onCancel: () => void;
  onSave: (body: string, mentions: number[]) => Promise<void>;
  people?: Mentionable[];
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="bg-surface border-line absolute top-16 left-1/2 z-20 w-72 -translate-x-1/2 rounded-xl border p-2 shadow-xl"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await onSave(text.trim(), mentionsIn(text, people));
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      id="diagram-shape-comment"
    >
      <p className="text-fg-subtle mb-1 px-1 text-xs">Comment on this shape</p>
      <MentionInput
        multiline
        autoFocus
        value={text}
        onChange={setText}
        people={people}
        onCancel={onCancel}
        onSubmit={() =>
          (document.getElementById("diagram-shape-comment") as HTMLFormElement | null)?.requestSubmit()
        }
        placeholder={people?.length ? "Write a comment… (@ to mention)" : "Write a comment…"}
        label="Comment"
        className="text-fg w-full resize-none bg-transparent px-1 text-sm outline-none"
      />
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>
          Comment
        </Button>
      </div>
    </form>
  );
}
