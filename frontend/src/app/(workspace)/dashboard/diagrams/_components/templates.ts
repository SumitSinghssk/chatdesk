import type { DiagramContent, DiagramEdge, DiagramNode } from "../../_lib/diagramsApi";
import { COLORS, defaultData, shapeOf, type ShapeKind } from "./editor/model";

type Color = "white" | "grey" | "blue" | "green" | "yellow" | "orange" | "red" | "purple" | "pink" | "teal";

const tone = (c: Color) => COLORS.find((x) => x.name.toLowerCase() === c)!;

function n(
  id: string,
  kind: ShapeKind,
  label: string,
  x: number,
  y: number,
  opts: { c?: Color; w?: number; h?: number } = {}
) {
  const size = shapeOf(kind);
  const data = defaultData(kind, label);
  const color = opts.c ? tone(opts.c) : null;
  return {
    id,
    type: "shape",
    position: { x, y },
    width: opts.w ?? size.w,
    height: opts.h ?? size.h,
    ...(kind === "frame" ? { zIndex: -1 } : {}),
    data: { ...data, ...(color ? { fill: color.fill, stroke: color.stroke, text: color.text } : {}) },
  } satisfies DiagramNode;
}

function e(source: string, target: string, label?: string, from = "b", to = "t") {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: from,
    targetHandle: to,
    type: "line",
    data: label ? { label } : {},
  } satisfies DiagramEdge;
}

function content(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramContent {
  return {
    nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
    edges: Object.fromEntries(edges.map((x) => [x.id, x])),
  };
}

export interface Template {
  key: string;
  name: string;
  description: string;
  content: DiagramContent;
}

export const TEMPLATES: Template[] = [
  {
    key: "blank",
    name: "Blank",
    description: "Start from nothing",
    content: { nodes: {}, edges: {} },
  },
  {
    key: "flowchart",
    name: "Flowchart",
    description: "Steps, a yes / no question and an end",
    content: content(
      [
        n("start", "terminal", "Start", 5, 0),
        n("step", "process", "Do the first step", 0, 110),
        n("check", "decision", "Is it OK?", 5, 220),
        n("fix", "process", "Fix it", 230, 238, { c: "orange" }),
        n("end", "terminal", "Done", 5, 380),
      ],
      [
        e("start", "step"),
        e("step", "check"),
        e("check", "end", "Yes"),
        e("check", "fix", "No", "r", "l"),
        e("fix", "step", undefined, "t", "r"),
      ]
    ),
  },
  {
    key: "enquiry",
    name: "Enquiry flow",
    description: "From a WhatsApp message to won or lost",
    content: content(
      [
        n("msg", "terminal", "Customer messages on WhatsApp", 0, 0, { w: 240 }),
        n("auto", "process", "Instant reply: “Thanks, we'll be right with you”", 0, 110, { w: 240, h: 72 }),
        n("assign", "process", "Assign to the right team member", 0, 230, { w: 240 }),
        n("reply", "decision", "Replied within 15 min?", 30, 340, { w: 180, h: 110 }),
        n("remind", "process", "Remind the owner, then the manager", 300, 363, { c: "red", w: 200 }),
        n("talk", "process", "Understand the need, share a quote", 0, 510, { w: 240 }),
        n("decide", "decision", "Interested?", 45, 620, { w: 150, h: 100 }),
        n("won", "terminal", "Won: confirm the order", 300, 640, { c: "green", w: 200 }),
        n("follow", "process", "Follow up in 2 days", 0, 780, { c: "yellow", w: 240 }),
        n("lost", "terminal", "Lost: note the reason", 0, 890, { c: "red", w: 240 }),
      ],
      [
        e("msg", "auto"),
        e("auto", "assign"),
        e("assign", "reply"),
        e("reply", "remind", "No", "r", "l"),
        e("remind", "talk", undefined, "b", "r"),
        e("reply", "talk", "Yes"),
        e("talk", "decide"),
        e("decide", "won", "Yes", "r", "l"),
        e("decide", "follow", "Not yet"),
        e("follow", "lost"),
      ]
    ),
  },
  {
    key: "journey",
    name: "Customer journey",
    description: "The steps a customer goes through",
    content: content(
      ["Finds you", "Asks a question", "Buys", "Gets the order", "Comes back"].map((label, i) =>
        n(`j${i}`, "rounded", label, i * 220, 0, {
          c: (["blue", "purple", "green", "orange", "pink"] as Color[])[i],
        })
      ),
      [0, 1, 2, 3].map((i) => e(`j${i}`, `j${i + 1}`, undefined, "r", "l"))
    ),
  },
  {
    key: "project",
    name: "Project board",
    description: "To do, doing and done, with notes",
    content: content(
      [
        n("todo", "frame", "To do", 0, 0, { w: 260, h: 420 }),
        n("doing", "frame", "Doing", 290, 0, { w: 260, h: 420 }),
        n("done", "frame", "Done", 580, 0, { w: 260, h: 420 }),
        n("t1", "note", "Write the new price list", 40, 50, { w: 180, h: 100 }),
        n("t2", "note", "Plan the Diwali campaign", 40, 170, { w: 180, h: 100, c: "pink" }),
        n("d1", "note", "Train the new team member", 330, 50, { w: 180, h: 100, c: "blue" }),
        n("x1", "note", "Set up WhatsApp number", 620, 50, { w: 180, h: 100, c: "green" }),
      ],
      []
    ),
  },
  {
    key: "org",
    name: "Org chart",
    description: "Who reports to whom",
    content: content(
      [
        n("o", "rounded", "Owner", 260, 0, { c: "purple" }),
        n("s", "rounded", "Sales lead", 40, 130, { c: "blue" }),
        n("p", "rounded", "Support lead", 480, 130, { c: "teal" }),
        n("s1", "process", "Sales team", 0, 260, { c: "white", w: 120 }),
        n("s2", "process", "Partners", 140, 260, { c: "white", w: 120 }),
        n("p1", "process", "Support team", 480, 260, { c: "white" }),
      ],
      [e("o", "s"), e("o", "p"), e("s", "s1"), e("s", "s2"), e("p", "p1")]
    ),
  },
  {
    key: "dataflow",
    name: "Data flow",
    description: "Where information comes from and goes",
    content: content(
      [
        n("web", "io", "Website form", 0, 0),
        n("wa", "io", "WhatsApp message", 0, 120),
        n("api", "process", "ChatDesk", 260, 60, { c: "green" }),
        n("db", "database", "Contacts", 520, 0),
        n("crm", "cloud", "Your CRM", 500, 130),
        n("team", "person", "Team", 280, 220),
      ],
      [
        e("web", "api", "API", "r", "l"),
        e("wa", "api", undefined, "r", "l"),
        e("api", "db", "saves", "r", "l"),
        e("api", "crm", "webhook", "r", "l"),
        e("api", "team", "notifies"),
      ]
    ),
  },
  {
    key: "swimlane",
    name: "Who does what",
    description: "Steps in lanes, one per person or team",
    content: content(
      [
        n("l1", "frame", "Customer", 0, 0, { w: 820, h: 140 }),
        n("l2", "frame", "Sales", 0, 160, { w: 820, h: 140 }),
        n("l3", "frame", "Delivery", 0, 320, { w: 820, h: 140 }),
        n("a", "rounded", "Places an order", 60, 45, { c: "blue" }),
        n("b", "process", "Confirms and takes payment", 260, 205, { c: "green", w: 190 }),
        n("c", "process", "Packs and ships", 500, 365, { c: "orange" }),
        n("d", "rounded", "Gets it", 620, 45, { c: "blue" }),
      ],
      [e("a", "b", undefined, "b", "l"), e("b", "c", undefined, "r", "t"), e("c", "d", undefined, "r", "b")]
    ),
  },
];
