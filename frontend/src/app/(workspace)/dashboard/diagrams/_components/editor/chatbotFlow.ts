import type { BotGraph, GraphEdge, GraphNode } from "../../../_lib/chatbotsApi";
import type { AiGraph } from "../../../_lib/diagramsApi";
import type { LineEdge, ShapeNode } from "./model";

/** Shapes that aren't steps of a flow (notes, areas, pictures…): left out of a chatbot. */
const NOT_STEPS = new Set([
  "note",
  "text",
  "frame",
  "phone",
  "image",
  "icon",
  "table",
  "entity",
  "uml",
  "record",
]);
const COLUMN = 380;
const ROW = 170;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const words = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const slug = (s: string) =>
  words(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1")
    .slice(0, 30) || "answer";

const looksLikeTeam = (label: string) =>
  /\b(team|agent|human|hand ?over|transfer|call (us|back)|support|staff)\b/i.test(label);
const looksLikeEnd = (label: string) => /^(end|stop|done|finish(ed)?|close|exit)\b/i.test(words(label));

export interface ChatbotDraft {
  graph: BotGraph;
  /** what became what, to tell the person before it's made */
  counts: { messages: number; choices: number; questions: number; handovers: number; ends: number };
  skipped: number;
}

/**
 * A chatbot from a drawn flow. Where it starts: a Start / end shape nothing points to (else the first shape
 * nothing points to). A shape with two or more ways out becomes buttons (a list past three), named after the
 * lines' labels (or where they go); Input/output and received messages ask a question; people and "team"
 * steps hand the chat to the team; ends end it; every other step sends its text.
 */
export function toChatbot(nodes: ShapeNode[], edges: LineEdge[]): ChatbotDraft {
  const steps = nodes.filter((n) => !NOT_STEPS.has(n.data.shape) && words(n.data.label));
  const ids = new Set(steps.map((n) => n.id));
  const lines = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const out = new Map<string, LineEdge[]>();
  const into = new Map<string, number>();
  for (const e of lines) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    into.set(e.target, (into.get(e.target) ?? 0) + 1);
  }
  const byId = new Map(steps.map((n) => [n.id, n]));
  const byPlace = (a: ShapeNode, b: ShapeNode) => a.position.y - b.position.y || a.position.x - b.position.x;
  const roots = steps.filter((n) => !into.get(n.id)).sort(byPlace);
  const first = roots.find((n) => n.data.shape === "terminal") ?? roots[0] ?? [...steps].sort(byPlace)[0];
  if (!first) throw new Error("Draw the steps of the flow first, joined with lines");

  // walk from the start: only what can be reached becomes part of the bot, in the order it's met
  const order: string[] = [];
  const depth = new Map<string, number>();
  const queue = [first.id];
  depth.set(first.id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const next = [...(out.get(id) ?? [])].sort((a, b) => byPlace(byId.get(a.target)!, byId.get(b.target)!));
    for (const e of next)
      if (!depth.has(e.target)) {
        depth.set(e.target, depth.get(id)! + 1);
        queue.push(e.target);
      }
  }
  const startIsShape = first.data.shape === "terminal" && !looksLikeTeam(first.data.label);
  const counts = { messages: 0, choices: 0, questions: 0, handovers: 0, ends: 0 };
  const rows = new Map<number, number>();
  const place = (id: string) => {
    const col = depth.get(id)! + (startIsShape ? 0 : 1);
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return { x: col * COLUMN, y: row * ROW };
  };
  const botId = (id: string) => `d${id.replace(/[^A-Za-z0-9_-]/g, "").slice(-30)}`;
  const nodesOut: GraphNode[] = [];
  const edgesOut: GraphEdge[] = [];
  const link = (source: string, target: string, handle = "out") =>
    edgesOut.push({
      id: `e-${source}-${handle}-${target}`.slice(0, 120),
      source,
      sourceHandle: handle,
      target,
    });

  const startId = "start";
  nodesOut.push({ id: startId, type: "start", position: { x: 0, y: 0 }, data: {} });
  if (!startIsShape) link(startId, botId(first.id));

  for (const id of order) {
    const n = byId.get(id)!;
    const label = words(n.data.label);
    const ways = [...(out.get(id) ?? [])]
      .filter((e) => depth.has(e.target))
      .sort((a, b) => byPlace(byId.get(a.target)!, byId.get(b.target)!));
    if (id === first.id && startIsShape) {
      // the Start shape is the bot's start: where it leads is where the bot begins
      const next = ways[0];
      if (next) link(startId, botId(next.target));
      continue;
    }
    const me = botId(id);
    const position = place(id);
    if (ways.length >= 2) {
      // a choice: buttons (up to 3) or a list (up to 10)
      const names = ways.map((e, i) => {
        const name =
          words((e.data?.label as string) ?? "") ||
          words(byId.get(e.target)?.data.label) ||
          `Option ${i + 1}`;
        return clip(name, ways.length > 3 ? 24 : 20);
      });
      const unique = names.map((t, i) => (names.indexOf(t) === i ? t : clip(`${t} ${i + 1}`, 20)));
      counts.choices++;
      if (ways.length <= 3) {
        nodesOut.push({
          id: me,
          type: "buttons",
          position,
          data: {
            text: clip(label, 1024),
            header_type: "none",
            buttons: unique.map((title, i) => ({ id: `b${i + 1}`, title })),
          },
        });
        ways.forEach((e, i) => link(me, botId(e.target), `b:b${i + 1}`));
      } else {
        const picked = ways.slice(0, 10);
        nodesOut.push({
          id: me,
          type: "list",
          position,
          data: {
            text: clip(label, 1024),
            button: "Choose",
            sections: [
              {
                title: null,
                rows: picked.map((_, i) => ({ id: `r${i + 1}`, title: unique[i], description: null })),
              },
            ],
          },
        });
        picked.forEach((e, i) => link(me, botId(e.target), `r:r${i + 1}`));
      }
      continue;
    }
    const shape = n.data.shape;
    if (!ways.length && (shape === "terminal" || looksLikeEnd(label))) {
      counts.ends++;
      nodesOut.push({
        id: me,
        type: "end",
        position,
        data: { text: looksLikeEnd(label) ? null : clip(label, 1024), resolve: false },
      });
      continue;
    }
    if (shape === "person" || looksLikeTeam(label)) {
      counts.handovers++;
      nodesOut.push({
        id: me,
        type: "handover",
        position,
        data: { assign: "auto", text: clip(label, 1024) },
      });
      continue;
    }
    if (shape === "io" || shape === "bubble-in") {
      counts.questions++;
      nodesOut.push({
        id: me,
        type: "question",
        position,
        data: { text: clip(label, 1024), kind: "text", variable: slug(label), save_to: "none" },
      });
    } else {
      counts.messages++;
      nodesOut.push({
        id: me,
        type: "message",
        position,
        data: { reply: { type: "text", text: clip(label, 4096) } },
      });
    }
    if (ways[0]) link(me, botId(ways[0].target));
  }
  if (nodesOut.length < 2) throw new Error("Join the steps with lines, starting from the first step");
  return { graph: { nodes: nodesOut, edges: edgesOut }, counts, skipped: nodes.length - order.length };
}

/** A chatbot's flow as a diagram (to share it, or talk it through with a client). */
export function fromChatbot(name: string, graph: BotGraph): AiGraph {
  const text = (n: GraphNode) => {
    const d = n.data as Record<string, unknown>;
    const reply = d.reply as { text?: string } | undefined;
    return words((d.text as string) ?? reply?.text ?? "");
  };
  const nodes: AiGraph["nodes"] = graph.nodes.map((n) => {
    const t = text(n);
    const d = n.data as Record<string, unknown>;
    switch (n.type) {
      case "start":
        return { id: n.id, label: "Start", shape: "terminal" };
      case "message":
        return { id: n.id, label: t || "Message", shape: "process" };
      case "buttons":
      case "list":
      case "condition":
        return { id: n.id, label: t || (n.type === "condition" ? "Check" : "Choose"), shape: "decision" };
      case "question":
        return { id: n.id, label: t || "Question", shape: "io" };
      case "handover":
        return { id: n.id, label: t || "Hand over to the team", shape: "person" };
      case "end":
        return { id: n.id, label: t || "End", shape: "terminal" };
      case "delay":
        return { id: n.id, label: `Wait ${d.amount ?? ""} ${d.unit ?? ""}`.trim(), shape: "process" };
      case "webhook":
        return {
          id: n.id,
          label: `Call ${words(String(d.url ?? "a website"))}`.slice(0, 80),
          shape: "process",
        };
      case "goto":
        return { id: n.id, label: "Go to another chatbot", shape: "terminal" };
      case "action":
        return { id: n.id, label: "Update the contact", shape: "process" };
      default:
        return { id: n.id, label: t || n.type, shape: "process" };
    }
  });
  const choice = (n: GraphNode | undefined, handle: string | null | undefined) => {
    if (!n || !handle) return "";
    const d = n.data as Record<string, unknown>;
    if (handle.startsWith("b:"))
      return (
        ((d.buttons as { id: string; title: string }[]) ?? []).find((b) => `b:${b.id}` === handle)?.title ??
        ""
      );
    if (handle.startsWith("r:"))
      return (
        ((d.sections as { rows: { id: string; title: string }[] }[]) ?? [])
          .flatMap((s) => s.rows)
          .find((r) => `r:${r.id}` === handle)?.title ?? ""
      );
    return handle === "out" ? "" : handle;
  };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = graph.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({
      from: e.source,
      to: e.target,
      label: clip(choice(byId.get(e.source), e.sourceHandle), 40),
    }));
  return { title: name, kind: "flowchart", nodes, edges };
}
