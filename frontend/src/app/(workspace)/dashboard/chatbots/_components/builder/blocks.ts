import {
  Clock,
  Flag,
  GitBranch,
  Globe,
  HelpCircle,
  List,
  MessageSquareText,
  MousePointerClick,
  Play,
  Repeat2,
  Tag,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { BlockData, BlockType, GraphNode } from "../../../_lib/chatbotsApi";

export interface BlockInfo {
  type: BlockType;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "Send" | "Ask" | "Logic" | "Do" | "Finish";
  /** Tailwind classes for the icon chip and the accent bar. */
  tone: string;
  accent: string;
  make: () => BlockData;
}

export const uid = (n = 6) =>
  Math.random()
    .toString(36)
    .slice(2, 2 + n);

export const BLOCKS: Record<BlockType, BlockInfo> = {
  start: {
    type: "start",
    label: "Start",
    description: "Where every chat begins",
    icon: Play,
    group: "Send",
    tone: "bg-emerald-500 text-white",
    accent: "bg-emerald-500",
    make: () => ({}),
  },
  message: {
    type: "message",
    label: "Message",
    description: "Text, image, video, PDF or a location",
    icon: MessageSquareText,
    group: "Send",
    tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    accent: "bg-sky-500",
    make: () => ({ reply: { type: "text", text: "" } }),
  },
  buttons: {
    type: "buttons",
    label: "Buttons",
    description: "A question with up to 3 reply buttons",
    icon: MousePointerClick,
    group: "Ask",
    tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    accent: "bg-violet-500",
    make: () => ({
      text: "",
      header_type: "none",
      buttons: [
        { id: uid(4), title: "Yes" },
        { id: uid(4), title: "No" },
      ],
    }),
  },
  list: {
    type: "list",
    label: "List",
    description: "A menu of up to 10 options",
    icon: List,
    group: "Ask",
    tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    accent: "bg-indigo-500",
    make: () => ({
      text: "",
      button: "Options",
      sections: [
        {
          title: null,
          rows: [
            { id: uid(4), title: "Option 1", description: null },
            { id: uid(4), title: "Option 2", description: null },
          ],
        },
      ],
    }),
  },
  question: {
    type: "question",
    label: "Question",
    description: "Ask and save the answer (name, email, date…)",
    icon: HelpCircle,
    group: "Ask",
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    accent: "bg-amber-500",
    make: () => ({ text: "", kind: "text", variable: "", save_to: "none" }),
  },
  condition: {
    type: "condition",
    label: "Condition",
    description: "Go one way or another (yes / no)",
    icon: GitBranch,
    group: "Logic",
    tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    accent: "bg-orange-500",
    make: () => ({ match: "all", rules: [{ field: "message", op: "contains", value: "" }] }),
  },
  delay: {
    type: "delay",
    label: "Delay",
    description: "Wait a moment before the next block",
    icon: Clock,
    group: "Logic",
    tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    accent: "bg-slate-500",
    make: () => ({ amount: 3, unit: "seconds" }),
  },
  goto: {
    type: "goto",
    label: "Go to chatbot",
    description: "Continue in another chatbot",
    icon: Repeat2,
    group: "Logic",
    tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
    accent: "bg-fuchsia-500",
    make: () => ({ chatbot_id: null }),
  },
  action: {
    type: "action",
    label: "Action",
    description: "Tag the contact, set a field, opt out…",
    icon: Tag,
    group: "Do",
    tone: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    accent: "bg-teal-500",
    make: () => ({ actions: [{ type: "add_tags", tags: [] }] }),
  },
  webhook: {
    type: "webhook",
    label: "API request",
    description: "Call your system and use the answer",
    icon: Globe,
    group: "Do",
    tone: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    accent: "bg-cyan-500",
    make: () => ({ method: "GET", url: "https://", headers: [], body: null, save: [] }),
  },
  handover: {
    type: "handover",
    label: "Hand over",
    description: "Pass the chat to your team",
    icon: UserRound,
    group: "Finish",
    tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    accent: "bg-rose-500",
    make: () => ({ assign: "auto", text: "Connecting you to our team. Someone will reply shortly." }),
  },
  end: {
    type: "end",
    label: "End",
    description: "Finish the chatbot (optionally resolve)",
    icon: Flag,
    group: "Finish",
    tone: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
    accent: "bg-zinc-500",
    make: () => ({ text: null, resolve: false }),
  },
};

export const PALETTE: { group: BlockInfo["group"]; blocks: BlockType[] }[] = [
  { group: "Send", blocks: ["message"] },
  { group: "Ask", blocks: ["buttons", "list", "question"] },
  { group: "Logic", blocks: ["condition", "delay", "goto"] },
  { group: "Do", blocks: ["action", "webhook"] },
  { group: "Finish", blocks: ["handover", "end"] },
];

/** The outputs of a block, in the order they're drawn. */
export function handlesOf(node: Pick<GraphNode, "type" | "data">): { id: string; label: string }[] {
  const d = node.data;
  switch (node.type) {
    case "buttons":
      return [
        ...(d.buttons ?? []).map((b) => ({ id: `b:${b.id}`, label: b.title || "Button" })),
        { id: "other", label: "Any other reply" },
      ];
    case "list":
      return [
        ...(d.sections ?? []).flatMap((s) =>
          s.rows.map((r) => ({ id: `r:${r.id}`, label: r.title || "Option" }))
        ),
        { id: "other", label: "Any other reply" },
      ];
    case "condition":
      return [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ];
    case "webhook":
      return [
        { id: "ok", label: "Success" },
        { id: "fail", label: "Failure" },
      ];
    case "question":
      return [
        { id: "out", label: "Answered" },
        { id: "invalid", label: "Wrong answers" },
      ];
    case "handover":
    case "goto":
    case "end":
      return [];
    default:
      return [{ id: "out", label: "Next" }];
  }
}

export const BUILTIN_VARIABLES = ["first_name", "name", "phone", "email"];

/** {{variables}} the flow sets (answers, API values, Action "set variable"). */
export function variablesOf(nodes: Pick<GraphNode, "type" | "data">[]): string[] {
  const out = new Set<string>();
  for (const n of nodes) {
    if (["question", "buttons", "list"].includes(n.type) && n.data.variable) out.add(n.data.variable);
    if (n.type === "webhook") (n.data.save ?? []).forEach((s) => s.variable && out.add(s.variable));
    if (n.type === "action")
      (n.data.actions ?? []).forEach(
        (a) => a.type === "set_variable" && a.key && out.add(a.key.toLowerCase())
      );
  }
  return [...out].sort();
}

export const QUESTION_KINDS = [
  { value: "text", label: "Any text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "date", label: "Date" },
  { value: "media", label: "Photo or file" },
] as const;

export const ACTION_LABELS: Record<string, string> = {
  add_tags: "Add tags",
  remove_tags: "Remove tags",
  set_attribute: "Set a contact field",
  set_name: "Set the contact's name",
  set_email: "Set the contact's email",
  set_variable: "Set a variable",
  opt_out: "Opt out of marketing",
  opt_in: "Opt in to marketing",
  resolve: "Mark the chat resolved",
};

export const FIELD_OPTIONS = [
  { value: "message", label: "Last message", group: "The chat" },
  { value: "tags", label: "Tags", group: "Contact" },
  { value: "contact:name", label: "Name", group: "Contact" },
  { value: "contact:email", label: "Email", group: "Contact" },
  { value: "contact:phone", label: "Phone", group: "Contact" },
  { value: "contact:opted_out", label: "Opted out (yes / no)", group: "Contact" },
  { value: "office_hours", label: "Office hours", group: "Business" },
];

export const OPS: Record<string, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "doesn't contain",
  starts_with: "starts with",
  is_set: "has a value",
  is_empty: "is empty",
  gt: "is more than",
  lt: "is less than",
  has: "include",
  not_has: "don't include",
  open: "open now",
  closed: "closed now",
};

export function opsFor(field: string): string[] {
  if (field === "office_hours") return ["open", "closed"];
  if (field === "tags") return ["has", "not_has", "is_set", "is_empty"];
  if (field === "contact:opted_out") return ["equals"];
  return [
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "is_set",
    "is_empty",
    "gt",
    "lt",
  ];
}

export function fieldLabel(field: string): string {
  if (field.startsWith("var:")) return `{{${field.slice(4)}}}`;
  if (field.startsWith("attr:")) return field.slice(5);
  return FIELD_OPTIONS.find((f) => f.value === field)?.label ?? field;
}

export const needsValue = (op: string) => !["is_set", "is_empty", "open", "closed"].includes(op);
