import type { AiGraph } from "../../../_lib/diagramsApi";
import { BRANCHES, mindLayout } from "./mindmap";
import {
  defaultData,
  layout,
  newId,
  shapeOf,
  toEdge,
  type LineEdge,
  type ShapeKind,
  type ShapeNode,
} from "./model";

/**
 * Shapes and lines for what the AI drew, laid out tidily: a flowchart top to bottom, a mind map around its
 * centre with a colour per branch. `at`: where its top left corner goes. Ids are new, so it can be added to
 * a diagram that already has shapes.
 */
export function graphShapes(graph: AiGraph, at = { x: 0, y: 0 }, page?: string) {
  const ids = new Map(graph.nodes.map((n) => [n.id, newId("n")]));
  const on = (data: ShapeNode["data"]) => (page ? { ...data, page } : data);
  if (graph.kind === "mindmap") return mindShapes(graph, ids, at, on);
  let nodes: ShapeNode[] = graph.nodes.map((n, i) => {
    const kind = n.shape as ShapeKind;
    const preset = shapeOf(kind);
    return {
      id: ids.get(n.id)!,
      type: "shape",
      position: { x: at.x, y: at.y + i * 120 },
      width: Math.max(preset.w, Math.min(240, n.label.length * 7.5 + 40)),
      height: preset.h,
      zIndex: 0,
      data: on(defaultData(kind, n.label)),
    };
  });
  const edges: LineEdge[] = graph.edges.map((e) =>
    toEdge({
      id: newId("e"),
      source: ids.get(e.from)!,
      target: ids.get(e.to)!,
      sourceHandle: "b",
      targetHandle: "t",
      type: "line",
      data: e.label ? { label: e.label } : {},
    })
  );
  nodes = layout(nodes, edges, "TB", new Set(nodes.map((n) => n.id)));
  // the layout keeps the top left where it was: move it to `at`
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  nodes = nodes.map((n) => ({
    ...n,
    position: { x: n.position.x - minX + at.x, y: n.position.y - minY + at.y },
  }));
  return { nodes, edges };
}

function mindShapes(
  graph: AiGraph,
  ids: Map<string, string>,
  at: { x: number; y: number },
  on: (data: ShapeNode["data"]) => ShapeNode["data"]
) {
  const rootId = ids.get(graph.nodes[0].id)!;
  const parent = new Map<string, string>();
  for (const e of graph.edges) if (!parent.has(e.to) && e.to !== graph.nodes[0].id) parent.set(e.to, e.from);
  const depth = (id: string) => {
    let d = 0;
    let p = id;
    while (parent.has(p) && d < 20) {
      p = parent.get(p)!;
      d++;
    }
    return d;
  };
  const mainOf = (id: string) => {
    let p = id;
    while (parent.has(p) && parent.get(p) !== graph.nodes[0].id) p = parent.get(p)!;
    return p;
  };
  const mains = graph.nodes.filter((n) => parent.get(n.id) === graph.nodes[0].id).map((n) => n.id);
  const nodes: ShapeNode[] = graph.nodes.map((n, i) => {
    const id = ids.get(n.id)!;
    if (id === rootId)
      return {
        id,
        type: "shape",
        position: { x: at.x + 400, y: at.y + 300 },
        width: 190,
        height: 70,
        zIndex: 0,
        data: on({
          ...defaultData("mind", n.label),
          fill: "#4c1d95",
          stroke: "#4c1d95",
          text: "#ffffff",
          fontSize: 18,
          bold: true,
        }),
      };
    const main = mains.indexOf(mainOf(n.id));
    const look = BRANCHES[Math.max(0, main) % BRANCHES.length];
    const first = depth(n.id) <= 1;
    // first half of the main branches to the right, the rest to the left; the layout keeps the sides
    const right = main < Math.ceil(mains.length / 2);
    return {
      id,
      type: "shape",
      position: { x: at.x + 400 + (right ? 1000 : -1000), y: at.y + i },
      width: 120,
      height: first ? 50 : 42,
      zIndex: 0,
      data: on({
        ...defaultData("mind", n.label),
        ...(first ? look : { fill: "#ffffff", stroke: look.stroke, text: look.text }),
        bold: first,
        fontSize: first ? 15 : 13,
      }),
    };
  });
  const edges: LineEdge[] = graph.edges
    .filter((e) => parent.get(e.to) === e.from)
    .map((e) =>
      toEdge({ id: newId("e"), source: ids.get(e.from)!, target: ids.get(e.to)!, type: "line", data: {} })
    );
  const laid = mindLayout(nodes, edges, rootId, () => false);
  const minX = Math.min(...laid.nodes.map((n) => n.position.x));
  const minY = Math.min(...laid.nodes.map((n) => n.position.y));
  return {
    nodes: laid.nodes.map((n) => ({
      ...n,
      position: { x: n.position.x - minX + at.x, y: n.position.y - minY + at.y },
    })),
    edges: laid.edges,
  };
}
