import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { DiagramContent, DiagramEdge, DiagramNode, Op } from "../../../_lib/diagramsApi";

// Shapes ---------------------------------------------------------------------------------------------

export type ShapeKind =
  | "process"
  | "rounded"
  | "decision"
  | "terminal"
  | "io"
  | "database"
  | "document"
  | "circle"
  | "hexagon"
  | "person"
  | "cloud"
  | "note"
  | "text"
  | "frame"
  | "bubble-out"
  | "bubble-in"
  | "phone"
  | "table"
  | "entity"
  | "uml"
  | "mind"
  | "icon"
  | "image"
  | "record";

export interface ShapeData extends Record<string, unknown> {
  shape: ShapeKind;
  label: string;
  fill?: string;
  stroke?: string;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  strokeStyle?: "solid" | "dashed" | "dotted";
  strokeWidth?: number;
  locked?: boolean;
  /** icon: a Lucide icon name, e.g. "server" */
  icon?: string;
  /** image: where the picture is, and how it fills the shape */
  src?: string;
  fit?: "contain" | "cover";
  /** table: cells, row by row; the first row is the header when `header` is on */
  rows?: string[][];
  header?: boolean;
  /** UML class and database table: one per line */
  fields?: string;
  methods?: string;
  /** message bubbles: the time shown (and ticks on sent ones) */
  time?: string;
  /** mind map ideas: the branch is folded away */
  collapsed?: boolean;
  /** a live ChatDesk card: which contact, order, campaign or chatbot it shows */
  record?: { type: "contact" | "order" | "campaign" | "chatbot"; id: number };
  /** the page it's on (none: the first page) */
  page?: string;
}

/** Shapes that sit behind everything else (others are dropped on top of them). */
export const BEHIND: ShapeKind[] = ["frame", "phone"];

export interface LineData extends Record<string, unknown> {
  label?: string;
  color?: string;
  path?: "smooth" | "straight" | "step" | "curve";
  dashed?: boolean;
  arrowEnd?: boolean;
  arrowStart?: boolean;
  width?: number;
  animated?: boolean;
}

export type ShapeNode = Node<ShapeData, "shape">;
export type LineEdge = Edge<LineData, "line">;

export interface PaletteItem {
  /** unique per palette entry (several entries can share a kind, e.g. the network icons) */
  key: string;
  kind: ShapeKind;
  label: string;
  w: number;
  h: number;
  group: string;
  hint: string;
  /** what the new shape starts with (on top of the kind's defaults) */
  data?: Partial<ShapeData>;
  /** picks something first: an icon from the library, an image file, or a ChatDesk record */
  action?: "icon" | "image" | "record";
}

const item = (
  kind: ShapeKind,
  label: string,
  w: number,
  h: number,
  group: string,
  hint: string,
  extra: Partial<PaletteItem> = {}
): PaletteItem => ({ key: kind, kind, label, w, h, group, hint, ...extra });

const network = (icon: string, label: string): PaletteItem =>
  item("icon", label, 76, 92, "Network & cloud", label, { key: `icon:${icon}`, data: { icon, label } });

export const SHAPES: PaletteItem[] = [
  item("process", "Process", 160, 64, "Flowchart", "A step or task"),
  item("decision", "Decision", 150, 100, "Flowchart", "A yes / no question"),
  item("terminal", "Start / end", 150, 56, "Flowchart", "Where the flow starts or ends"),
  item("io", "Input / output", 170, 64, "Flowchart", "Data in or out"),
  item("document", "Document", 150, 76, "Flowchart", "A file, form or report"),
  item("database", "Database", 120, 90, "Flowchart", "Stored data"),
  item("rounded", "Rounded box", 160, 64, "Basic", "A softer box"),
  item("circle", "Circle", 100, 100, "Basic", "A state or point"),
  item("hexagon", "Hexagon", 150, 80, "Basic", "A preparation step"),
  item("cloud", "Cloud", 170, 100, "Basic", "An outside service"),
  item("person", "Person", 90, 110, "Basic", "Someone involved"),
  item("bubble-out", "Message sent", 230, 72, "WhatsApp", "A message your business sends"),
  item("bubble-in", "Message received", 230, 64, "WhatsApp", "A message from the customer"),
  item("phone", "Phone screen", 280, 520, "WhatsApp", "A WhatsApp chat on a phone: put messages on it"),
  item("table", "Table", 320, 130, "Data", "Rows and columns you can type in"),
  item("entity", "Database table", 230, 150, "Data", "A table with its columns and keys"),
  item("uml", "UML class", 220, 160, "Data", "A class with its fields and methods"),
  item("mind", "Idea", 150, 52, "Mind map", "A branch of a mind map"),
  item("mind", "Main topic", 190, 70, "Mind map", "The centre of a mind map", {
    key: "mind:main",
    data: { label: "Main topic", fill: "#4c1d95", stroke: "#4c1d95", text: "#ffffff", fontSize: 18 },
  }),
  network("server", "Server"),
  network("database", "Database"),
  network("cloud", "Cloud"),
  network("router", "Router"),
  network("wifi", "Wi-Fi"),
  network("laptop", "Laptop"),
  network("smartphone", "Phone"),
  network("shield-check", "Firewall"),
  network("globe", "Internet"),
  network("hard-drive", "Storage"),
  network("users", "Users"),
  network("mail", "Email"),
  item("icon", "Icon…", 76, 92, "Images & icons", "Search 2,000+ icons", {
    key: "icon:pick",
    action: "icon",
  }),
  item("image", "Image or logo…", 220, 150, "Images & icons", "Upload a picture or logo", {
    key: "image:upload",
    action: "image",
  }),
  item("record", "Contact", 250, 112, "ChatDesk (live)", "A customer, kept up to date", {
    key: "record:contact",
    action: "record",
    data: { record: { type: "contact", id: 0 } },
  }),
  item("record", "Order", 240, 112, "ChatDesk (live)", "An order with its status and total", {
    key: "record:order",
    action: "record",
    data: { record: { type: "order", id: 0 } },
  }),
  item("record", "Campaign", 260, 124, "ChatDesk (live)", "A campaign with how it's doing", {
    key: "record:campaign",
    action: "record",
    data: { record: { type: "campaign", id: 0 } },
  }),
  item("record", "Chatbot", 240, 104, "ChatDesk (live)", "A chatbot: live or off, and its chats", {
    key: "record:chatbot",
    action: "record",
    data: { record: { type: "chatbot", id: 0 } },
  }),
  item("note", "Sticky note", 170, 120, "Notes", "A note or idea"),
  item("text", "Text", 180, 40, "Notes", "Free text"),
  item("frame", "Frame", 420, 280, "Notes", "Group things in an area"),
];

export const shapeOf = (kind: string | undefined) => SHAPES.find((s) => s.kind === kind) ?? SHAPES[0];

/** Soft fills with a matching border and text colour, in both themes. */
export const COLORS: { name: string; fill: string; stroke: string; text: string }[] = [
  { name: "White", fill: "#ffffff", stroke: "#94a3b8", text: "#0f172a" },
  { name: "Grey", fill: "#f1f5f9", stroke: "#64748b", text: "#0f172a" },
  { name: "Blue", fill: "#dbeafe", stroke: "#3b82f6", text: "#1e3a8a" },
  { name: "Green", fill: "#dcfce7", stroke: "#22c55e", text: "#14532d" },
  { name: "Yellow", fill: "#fef9c3", stroke: "#eab308", text: "#713f12" },
  { name: "Orange", fill: "#ffedd5", stroke: "#f97316", text: "#7c2d12" },
  { name: "Red", fill: "#fee2e2", stroke: "#ef4444", text: "#7f1d1d" },
  { name: "Purple", fill: "#ede9fe", stroke: "#8b5cf6", text: "#4c1d95" },
  { name: "Pink", fill: "#fce7f3", stroke: "#ec4899", text: "#831843" },
  { name: "Teal", fill: "#ccfbf1", stroke: "#14b8a6", text: "#134e4a" },
  { name: "Dark", fill: "#1e293b", stroke: "#0f172a", text: "#f8fafc" },
];

export const LINE_COLORS = [
  "#64748b",
  "#0f172a",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
];

const EXTRA: Partial<Record<ShapeKind, Partial<ShapeData>>> = {
  "bubble-out": {
    label: "Hi! Your order is on its way 🚚",
    fill: "#d9fdd3",
    stroke: "#d9fdd3",
    text: "#111b21",
    time: "10:24",
    align: "left",
  },
  "bubble-in": {
    label: "When will it arrive?",
    fill: "#ffffff",
    stroke: "#ffffff",
    text: "#111b21",
    time: "10:25",
    align: "left",
  },
  phone: { label: "Your Business", fill: "#efeae2", stroke: "#111827", text: "#ffffff" },
  table: {
    label: "",
    header: true,
    rows: [
      ["Name", "Phone", "Status"],
      ["", "", ""],
      ["", "", ""],
    ],
    fontSize: 13,
  },
  entity: {
    label: "contacts",
    fields: "id  int  PK\nname  text\nphone  text\nnumber_id  int  FK",
    fill: "#dbeafe",
    stroke: "#3b82f6",
    text: "#1e3a8a",
    fontSize: 13,
  },
  uml: {
    label: "Customer",
    fields: "+ name: string\n+ phone: string",
    methods: "+ sendMessage()\n+ placeOrder()",
    fill: "#fef9c3",
    stroke: "#eab308",
    text: "#713f12",
    fontSize: 13,
  },
  mind: { label: "Idea", fill: "#ede9fe", stroke: "#8b5cf6", text: "#4c1d95", bold: true },
  icon: { label: "", icon: "star", text: "#334155", fontSize: 12 },
  image: { label: "", fit: "contain" },
  record: { label: "" },
};

export function defaultData(kind: ShapeKind, label?: string): ShapeData {
  if (EXTRA[kind]) {
    const extra = EXTRA[kind]!;
    return { shape: kind, fontSize: 14, ...extra, label: label ?? extra.label ?? "" } as ShapeData;
  }
  const color =
    kind === "note"
      ? COLORS[4]
      : kind === "terminal"
        ? COLORS[3]
        : kind === "decision"
          ? COLORS[5]
          : kind === "frame" || kind === "text"
            ? null
            : COLORS[2];
  return {
    shape: kind,
    label: label ?? (kind === "text" ? "Text" : kind === "frame" ? "Area" : ""),
    ...(color ? { fill: color.fill, stroke: color.stroke, text: color.text } : {}),
    fontSize: kind === "frame" ? 13 : 14,
  };
}

// Ids ----------------------------------------------------------------------------------------------------

export const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Saved <-> on screen ---------------------------------------------------------------------------------------

const round = (n: number) => Math.round(n * 10) / 10;

export function toNode(n: DiagramNode): ShapeNode {
  const data = {
    ...(defaultData((n.data?.shape as ShapeKind) ?? "process") as ShapeData),
    ...(n.data as ShapeData),
  };
  return {
    id: n.id,
    type: "shape",
    position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
    width: n.width ?? shapeOf(data.shape).w,
    height: n.height ?? shapeOf(data.shape).h,
    zIndex: BEHIND.includes(data.shape) ? -1 : (n.zIndex ?? 0),
    draggable: !data.locked,
    data,
  };
}

export function fromNode(n: Node): DiagramNode {
  const data = n.data as ShapeData;
  return {
    id: n.id,
    type: "shape",
    position: { x: round(n.position.x), y: round(n.position.y) },
    width: round(n.width ?? n.measured?.width ?? shapeOf(data.shape).w),
    height: round(n.height ?? n.measured?.height ?? shapeOf(data.shape).h),
    ...(n.zIndex && !BEHIND.includes(data.shape) ? { zIndex: n.zIndex } : {}),
    data,
  };
}

export function marker(color: string) {
  return { type: MarkerType.ArrowClosed, color, width: 18, height: 18 };
}

export function toEdge(e: DiagramEdge): LineEdge {
  const data = (e.data ?? {}) as LineData;
  const color = data.color ?? LINE_COLORS[0];
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: "line",
    data,
    markerEnd: data.arrowEnd === false ? undefined : marker(color),
    markerStart: data.arrowStart ? marker(color) : undefined,
    animated: !!data.animated,
  };
}

export function fromEdge(e: Edge): DiagramEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    type: "line",
    data: (e.data ?? {}) as LineData,
  };
}

export function fromContent(content: DiagramContent | undefined) {
  const nodes = Object.values(content?.nodes ?? {}).map(toNode);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = Object.values(content?.edges ?? {})
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map(toEdge);
  return { nodes, edges };
}

export function toContent(nodes: Node[], edges: Edge[]): DiagramContent {
  return {
    nodes: Object.fromEntries(nodes.map((n) => [n.id, fromNode(n)])),
    edges: Object.fromEntries(edges.map((e) => [e.id, fromEdge(e)])),
  };
}

// What changed ---------------------------------------------------------------------------------------------

/** The saved form of every element, by "n:id" / "e:id", to tell what changed since. */
export type Snapshot = Map<string, string>;

export function snapshot(content: DiagramContent): Snapshot {
  // in the same form `diff` produces from the screen, so nothing looks changed when it isn't
  const map: Snapshot = new Map();
  for (const n of Object.values(content.nodes)) map.set(`n:${n.id}`, JSON.stringify(fromNode(toNode(n))));
  for (const e of Object.values(content.edges)) map.set(`e:${e.id}`, JSON.stringify(fromEdge(toEdge(e))));
  return map;
}

/** Changes that turn `before` into what's on screen. */
export function diff(before: Snapshot, nodes: Node[], edges: Edge[]): Op[] {
  const ops: Op[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const saved = fromNode(n);
    const key = `n:${n.id}`;
    seen.add(key);
    if (before.get(key) !== JSON.stringify(saved)) ops.push({ k: "n", id: n.id, v: saved });
  }
  for (const e of edges) {
    const saved = fromEdge(e);
    const key = `e:${e.id}`;
    seen.add(key);
    if (before.get(key) !== JSON.stringify(saved)) ops.push({ k: "e", id: e.id, v: saved });
  }
  for (const key of before.keys()) {
    if (!seen.has(key)) ops.push({ k: key[0] as "n" | "e", id: key.slice(2), v: null });
  }
  return ops;
}

/** Applies changes to a snapshot (what was saved, or came from someone else). */
export function remember(snap: Snapshot, ops: Op[]) {
  for (const op of ops) {
    const key = `${op.k}:${op.id}`;
    if (op.v === null) snap.delete(key);
    else
      snap.set(
        key,
        JSON.stringify(
          op.k === "n" ? fromNode(toNode(op.v as DiagramNode)) : fromEdge(toEdge(op.v as DiagramEdge))
        )
      );
  }
}

/** Applies changes to what's on screen. `skip`: shapes this tab is moving right now. */
export function applyOps(nodes: ShapeNode[], edges: LineEdge[], ops: Op[], skip?: Set<string>) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  for (const op of ops) {
    if (op.k === "n") {
      if (skip?.has(op.id)) continue;
      if (op.v === null) nodeMap.delete(op.id);
      else {
        const next = toNode(op.v as DiagramNode);
        const prev = nodeMap.get(op.id);
        nodeMap.set(op.id, prev ? { ...next, selected: prev.selected } : next);
      }
    } else if (op.v === null) edgeMap.delete(op.id);
    else {
      const next = toEdge(op.v as DiagramEdge);
      const prev = edgeMap.get(op.id);
      edgeMap.set(op.id, prev ? { ...next, selected: prev.selected } : next);
    }
  }
  const ids = new Set(nodeMap.keys());
  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()].filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

// Tidy up ------------------------------------------------------------------------------------------------------

/**
 * Lays shapes out in rows (top to bottom) or columns (left to right) following the lines:
 * each shape goes one step after the shapes that point to it, and each row is ordered to keep lines short.
 */
export function layout(nodes: ShapeNode[], edges: LineEdge[], direction: "TB" | "LR", only?: Set<string>) {
  const movable = nodes.filter(
    (n) => !BEHIND.includes(n.data.shape) && n.data.shape !== "text" && (!only || only.has(n.id))
  );
  if (movable.length < 2) return nodes;
  const ids = new Set(movable.map((n) => n.id));
  const links = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const incoming = new Map<string, string[]>(movable.map((n) => [n.id, []]));
  const outgoing = new Map<string, string[]>(movable.map((n) => [n.id, []]));
  for (const e of links) {
    incoming.get(e.target)!.push(e.source);
    outgoing.get(e.source)!.push(e.target);
  }
  // rank by longest path from a start, ignoring lines that loop back
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const r = Math.max(-1, ...incoming.get(id)!.map(visit)) + 1;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  movable.forEach((n) => visit(n.id));
  const rows: string[][] = [];
  for (const n of movable) (rows[rank.get(n.id)!] ??= []).push(n.id);
  // order each row by where the shapes it comes from sit (two passes is plenty for hand-drawn diagrams)
  const pos = new Map<string, number>();
  rows.forEach((row) => row.forEach((id, i) => pos.set(id, i)));
  for (let pass = 0; pass < 2; pass++) {
    rows.forEach((row, r) => {
      if (r === 0) return;
      const weight = (id: string) => {
        const from = incoming.get(id)!.filter((p) => pos.has(p));
        return from.length ? from.reduce((s, p) => s + pos.get(p)!, 0) / from.length : pos.get(id)!;
      };
      row.sort((a, b) => weight(a) - weight(b));
      row.forEach((id, i) => pos.set(id, i));
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const size = (id: string) => {
    const n = byId.get(id)!;
    return { w: n.width ?? n.measured?.width ?? 160, h: n.height ?? n.measured?.height ?? 64 };
  };
  const GAP_ALONG = 70;
  const GAP_ACROSS = 50;
  const minX = Math.min(...movable.map((n) => n.position.x));
  const minY = Math.min(...movable.map((n) => n.position.y));
  const placed = new Map<string, { x: number; y: number }>();
  let offset = 0;
  const widest = Math.max(
    ...rows.map((row) =>
      row.reduce((s, id) => s + (direction === "TB" ? size(id).w : size(id).h) + GAP_ACROSS, -GAP_ACROSS)
    )
  );
  for (const row of rows) {
    if (!row) continue;
    const across = row.reduce(
      (s, id) => s + (direction === "TB" ? size(id).w : size(id).h) + GAP_ACROSS,
      -GAP_ACROSS
    );
    let cursor = (widest - across) / 2;
    const depth = Math.max(...row.map((id) => (direction === "TB" ? size(id).h : size(id).w)));
    for (const id of row) {
      const { w, h } = size(id);
      placed.set(
        id,
        direction === "TB"
          ? { x: minX + cursor, y: minY + offset + (depth - h) / 2 }
          : { x: minX + offset + (depth - w) / 2, y: minY + cursor }
      );
      cursor += (direction === "TB" ? w : h) + GAP_ACROSS;
    }
    offset += depth + GAP_ALONG;
  }
  return nodes.map((n) => (placed.has(n.id) ? { ...n, position: placed.get(n.id)! } : n));
}
