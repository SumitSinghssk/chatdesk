import { newId, toEdge, defaultData, type LineEdge, type ShapeNode } from "./model";

/** Colours for the main branches, in order; ideas further out take their branch's colour. */
export const BRANCHES = [
  { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e3a8a" },
  { fill: "#dcfce7", stroke: "#22c55e", text: "#14532d" },
  { fill: "#ffedd5", stroke: "#f97316", text: "#7c2d12" },
  { fill: "#fce7f3", stroke: "#ec4899", text: "#831843" },
  { fill: "#ccfbf1", stroke: "#14b8a6", text: "#134e4a" },
  { fill: "#fef9c3", stroke: "#eab308", text: "#713f12" },
  { fill: "#fee2e2", stroke: "#ef4444", text: "#7f1d1d" },
  { fill: "#ede9fe", stroke: "#8b5cf6", text: "#4c1d95" },
];

const GAP_OUT = 64; // from an idea to its children
const GAP_DOWN = 16; // between ideas above one another

export type Side = "l" | "r";

export interface MindTree {
  parent: Map<string, string>;
  kids: Map<string, string[]>;
  /** which side of the centre each idea grows on */
  side: Map<string, Side>;
}

const isMind = (n: ShapeNode) => n.data.shape === "mind";
const width = (n: ShapeNode) => n.width ?? 150;
const height = (n: ShapeNode) => n.height ?? 52;
const middle = (n: ShapeNode) => ({ x: n.position.x + width(n) / 2, y: n.position.y + height(n) / 2 });

/** Ideas and the lines between them: each idea's parent is the first idea pointing to it. */
export function mindTree(nodes: ShapeNode[], edges: LineEdge[]): MindTree {
  const byId = new Map(nodes.filter(isMind).map((n) => [n.id, n]));
  const parent = new Map<string, string>();
  const kids = new Map<string, string[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target || parent.has(e.target)) continue;
    let up: string | undefined = e.source;
    while (up && up !== e.target) up = parent.get(up);
    if (up) continue; // would make a loop
    parent.set(e.target, e.source);
    kids.set(e.source, [...(kids.get(e.source) ?? []), e.target]);
  }
  const side = new Map<string, Side>();
  const mark = (id: string, s: Side) => {
    side.set(id, s);
    for (const k of kids.get(id) ?? []) mark(k, s);
  };
  for (const [id, n] of byId) {
    if (parent.has(id)) continue;
    const centre = middle(n).x;
    for (const k of kids.get(id) ?? []) mark(k, middle(byId.get(k)!).x < centre ? "l" : "r");
  }
  return { parent, kids, side };
}

export function rootOf(tree: MindTree, id: string) {
  let at = id;
  while (tree.parent.has(at)) at = tree.parent.get(at)!;
  return at;
}

export function branchOf(tree: MindTree, id: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const k of tree.kids.get(at) ?? []) {
      out.push(k);
      walk(k);
    }
  };
  walk(id);
  return out;
}

/** Ideas inside a folded branch. `folded` says whether an idea is folded (it can differ per viewer). */
export function hiddenIdeas(tree: MindTree, folded: (id: string) => boolean) {
  const hidden = new Set<string>();
  for (const id of tree.kids.keys()) if (folded(id)) branchOf(tree, id).forEach((k) => hidden.add(k));
  return hidden;
}

let measurer: CanvasRenderingContext2D | null = null;
function textWidth(text: string, size: number, bold: boolean) {
  if (typeof document === "undefined") return text.length * size * 0.55;
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * size * 0.55;
  measurer.font = `${bold ? 600 : 400} ${size}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
  return Math.max(0, ...text.split("\n").map((l) => measurer!.measureText(l).width));
}

/** An idea's size from its text: as wide as the words, wrapping past a limit. */
function fit(n: ShapeNode, isRoot: boolean) {
  const size = n.data.fontSize ?? 14;
  const text = n.data.label || " ";
  const widest = isRoot ? 320 : 280;
  const tw = textWidth(text, size, !!n.data.bold) + 44;
  const w = Math.round(Math.min(widest, Math.max(isRoot ? 150 : 96, tw)));
  const lines = text
    .split("\n")
    .reduce((s, l) => s + Math.max(1, Math.ceil((textWidth(l, size, !!n.data.bold) + 44) / widest)), 0);
  const h = Math.round(Math.max(isRoot ? 64 : size >= 15 ? 50 : 42, lines * size * 1.35 + 22));
  return { w, h };
}

/**
 * Lays one mind map out: the centre stays put, main branches go to its right and left (as they are now),
 * each branch's ideas stacked beside it. Lines are re-pointed and take their branch's colour.
 */
export function mindLayout(
  nodes: ShapeNode[],
  edges: LineEdge[],
  rootId: string,
  folded: (id: string) => boolean
) {
  const tree = mindTree(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get(rootId);
  if (!root || !isMind(root)) return { nodes, edges };
  const size = new Map<string, { w: number; h: number }>();
  const ids = [rootId, ...branchOf(tree, rootId)];
  for (const id of ids) {
    const n = byId.get(id)!;
    size.set(id, n.data.locked ? { w: width(n), h: height(n) } : fit(n, id === rootId));
  }
  const order = (list: string[]) =>
    [...list].sort((a, b) => byId.get(a)!.position.y - byId.get(b)!.position.y);
  const shown = (id: string) => (folded(id) ? [] : order(tree.kids.get(id) ?? []));
  const span = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = shown(id);
    const own = size.get(id)!.h;
    const below = kids.reduce((s, k) => s + measure(k), 0) + GAP_DOWN * Math.max(0, kids.length - 1);
    const total = Math.max(own, below);
    span.set(id, total);
    return total;
  };
  const placed = new Map<string, { x: number; y: number }>();
  const stack = (list: string[], side: Side, edge: number, centreY: number) => {
    const total = list.reduce((s, k) => s + span.get(k)!, 0) + GAP_DOWN * Math.max(0, list.length - 1);
    let top = centreY - total / 2;
    for (const k of list) {
      const { w, h } = size.get(k)!;
      const mid = top + span.get(k)! / 2;
      const x = side === "r" ? edge : edge - w;
      placed.set(k, { x: Math.round(x), y: Math.round(mid - h / 2) });
      stack(shown(k), side, side === "r" ? x + w + GAP_OUT : x - GAP_OUT, mid);
      top += span.get(k)! + GAP_DOWN;
    }
  };
  const main = shown(rootId);
  main.forEach(measure);
  const r = size.get(rootId)!;
  const centre = middle(root);
  const rootPos = { x: Math.round(centre.x - r.w / 2), y: Math.round(centre.y - r.h / 2) };
  placed.set(rootId, rootPos);
  const right = main.filter((k) => tree.side.get(k) !== "l");
  const left = main.filter((k) => tree.side.get(k) === "l");
  stack(right, "r", rootPos.x + r.w + GAP_OUT, centre.y);
  stack(left, "l", rootPos.x - GAP_OUT, centre.y);

  const nextNodes = nodes.map((n) => {
    const at = placed.get(n.id);
    if (!at) return n;
    const s = size.get(n.id)!;
    return { ...n, position: n.data.locked ? n.position : at, width: s.w, height: s.h };
  });
  const inTree = new Set(ids);
  const nextEdges = edges.map((e) => {
    if (!inTree.has(e.target) || tree.parent.get(e.target) !== e.source) return e;
    const side = tree.side.get(e.target) ?? "r";
    const branch = byId.get(mainOf(tree, e.target, rootId))!;
    const next = toEdge({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: side === "r" ? "r" : "l",
      targetHandle: side === "r" ? "l" : "r",
      type: "line",
      data: { ...(e.data ?? {}), path: "curve", arrowEnd: false, width: 2, color: branch.data.stroke },
    });
    return { ...next, selected: e.selected };
  });
  return { nodes: nextNodes, edges: nextEdges };
}

/** The main branch (a child of the centre) an idea is on. */
function mainOf(tree: MindTree, id: string, rootId: string) {
  let at = id;
  while (tree.parent.get(at) && tree.parent.get(at) !== rootId) at = tree.parent.get(at)!;
  return at;
}

/** Adds an idea under `parentId` (after `after`, when given) and lays the map out again. */
export function addIdea(
  nodes: ShapeNode[],
  edges: LineEdge[],
  parentId: string,
  folded: (id: string) => boolean,
  after?: string
) {
  const tree = mindTree(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = byId.get(parentId)!;
  const rootId = rootOf(tree, parentId);
  const root = byId.get(rootId)!;
  const isMain = parentId === rootId;
  const siblings = tree.kids.get(parentId) ?? [];
  // the side: next to `after`; for a new main branch, the side with fewer
  const side: Side = after
    ? (tree.side.get(after) ?? "r")
    : isMain
      ? siblings.filter((k) => tree.side.get(k) === "l").length <
        siblings.filter((k) => tree.side.get(k) !== "l").length
        ? "l"
        : "r"
      : (tree.side.get(parentId) ?? "r");
  const look = isMain
    ? BRANCHES[siblings.length % BRANCHES.length]
    : {
        fill: "#ffffff",
        stroke: byId.get(mainOf(tree, parentId, rootId))?.data.stroke ?? BRANCHES[0].stroke,
        text: byId.get(mainOf(tree, parentId, rootId))?.data.text ?? BRANCHES[0].text,
      };
  // a spot that puts it in the right place among its siblings before the layout tidies up
  const ref = after ? byId.get(after) : null;
  const lowest = siblings
    .filter((k) => !isMain || (tree.side.get(k) ?? "r") === side)
    .reduce((y, k) => Math.max(y, byId.get(k)!.position.y), parent.position.y);
  const y = ref ? ref.position.y + 0.5 : lowest + 1;
  const x = side === "r" ? root.position.x + width(root) + 1000 : root.position.x - 1000;
  const id = newId("n");
  const idea: ShapeNode = {
    id,
    type: "shape",
    position: { x, y },
    width: 120,
    height: isMain ? 50 : 42,
    zIndex: 0,
    data: {
      ...defaultData("mind"),
      label: "New idea",
      ...look,
      bold: isMain,
      fontSize: isMain ? 15 : 13,
    },
  };
  const line = toEdge({ id: newId("e"), source: parentId, target: id, type: "line", data: {} });
  const opened = nodes.map((n) =>
    n.id === parentId && n.data.collapsed ? { ...n, data: { ...n.data, collapsed: false } } : n
  );
  const isFolded = (k: string) => (k === parentId ? false : folded(k));
  const laid = mindLayout([...opened, idea], [...edges, line], rootId, isFolded);
  return { ...laid, id };
}
