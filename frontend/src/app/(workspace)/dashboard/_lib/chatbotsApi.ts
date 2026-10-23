import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";

import type { MatchType, Reply } from "./automationApi";

export type BotTrigger = "keyword" | "new_chat" | "any" | "ad" | "manual";
export type BlockType =
  | "start"
  | "message"
  | "buttons"
  | "list"
  | "question"
  | "condition"
  | "action"
  | "handover"
  | "delay"
  | "webhook"
  | "goto"
  | "end";

export interface Choice {
  id: string;
  title: string;
}
export interface ListRow {
  id: string;
  title: string;
  description?: string | null;
}
export interface ConditionRule {
  field: string;
  op: string;
  value?: string | null;
}
export interface BotAction {
  type:
    | "add_tags"
    | "remove_tags"
    | "set_attribute"
    | "set_name"
    | "set_email"
    | "set_variable"
    | "opt_out"
    | "opt_in"
    | "resolve";
  tags?: string[];
  key?: string | null;
  value?: string | null;
}

/** What a block holds (one shape for every type; each type uses its own fields). */
export interface BlockData {
  label?: string | null;
  // message
  reply?: Reply;
  // buttons / list / question
  text?: string | null;
  header_type?: "none" | "text" | "image" | "video" | "document";
  header?: string | null;
  media_key?: string | null;
  media_filename?: string | null;
  footer?: string | null;
  buttons?: Choice[];
  button?: string | null;
  sections?: { title?: string | null; rows: ListRow[] }[];
  variable?: string | null;
  kind?: "text" | "number" | "email" | "phone" | "date" | "media";
  save_to?: "none" | "name" | "email" | "attribute";
  min?: number | null;
  max?: number | null;
  retry_text?: string | null;
  // condition
  match?: "all" | "any";
  rules?: ConditionRule[];
  // action
  actions?: BotAction[];
  // handover
  assign?: "auto" | "member" | "team" | "nobody";
  member_id?: number | null;
  team_id?: number | null;
  // delay
  amount?: number;
  unit?: "seconds" | "minutes" | "hours";
  // webhook
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url?: string;
  headers?: { key: string; value: string }[];
  body?: string | null;
  save?: { path: string; variable: string }[];
  // goto / end
  chatbot_id?: number | null;
  resolve?: boolean;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: BlockType;
  position: { x: number; y: number };
  data: BlockData;
}
export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}
export interface BotGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BotSettings {
  timeout_minutes: number;
  timeout_text: string | null;
  invalid_text: string | null;
  max_retries: number;
  on_fail: "handover" | "end";
  exit_keywords: string[];
  handover_text: string | null;
}

export interface BotMeta {
  name: string;
  description: string | null;
  trigger: BotTrigger;
  match: MatchType;
  keywords: string[];
  restart_minutes: number;
  settings: BotSettings;
}

export interface BotStats {
  started: number;
  completed: number;
  handover: number;
  active: number;
  completion_rate: number | null;
}

export interface Chatbot extends BotMeta {
  id: number;
  active: boolean;
  published: boolean;
  version: number;
  published_at: string | null;
  has_changes: boolean;
  blocks: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stats: BotStats;
}

export interface Problem {
  node_id: string | null;
  message: string;
}
export interface Problems {
  errors: Problem[];
  warnings: Problem[];
}

export interface ChatbotDetail extends Chatbot {
  graph: BotGraph;
  problems: Problems;
  chatbots: { id: number; name: string }[];
}

export interface Starter {
  key: string;
  name: string;
  description: string;
  trigger: BotTrigger;
  keywords: string[];
}

export interface BotReport {
  days: number;
  started: number;
  active: number;
  completed: number;
  handover: number;
  dropped: number;
  reasons: Record<string, number>;
  completion_rate: number | null;
  nodes: Record<string, { reached: number; dropped: number }>;
  edges: Record<string, number>;
  recent: {
    id: number;
    status: "active" | "ended";
    end_reason: string | null;
    trigger: string | null;
    node_id: string | null;
    node: string | null;
    conversation_id: number;
    variables: Record<string, unknown>;
    contact: { id: number; name: string | null; phone: string } | null;
    started_at: string;
    ended_at: string | null;
    error: string | null;
  }[];
}

/** A composed message as the test chat shows it. */
export interface SimReply extends Partial<Reply> {
  type: Reply["type"];
  header_type?: string;
  choices?: Choice[];
  sections?: { title?: string | null; rows: ListRow[] }[];
}

export type SimEvent =
  | { kind: "message"; node_id: string | null; reply: SimReply }
  | { kind: "delay"; node_id: string; seconds: number }
  | { kind: "end"; node_id: string | null; reason: string; text: string }
  | {
      kind: "note" | "action" | "condition" | "webhook" | "handover" | "goto" | "error";
      node_id: string | null;
      text: string;
    };

export interface SimState {
  status: "active" | "ended";
  end_reason: string | null;
  node_id: string | null;
  wait: string | null;
  retries: number;
  variables: Record<string, unknown>;
  trail: [string, string | null][];
  chatbot_id: number;
}

export interface SimResult {
  events: SimEvent[];
  waiting: { node_id: string; type: BlockType; kind: string | null } | null;
  contact: { name: string; email: string | null; tags: string[]; attributes: Record<string, string> };
  state: SimState;
}

export interface SimContact {
  name: string;
  phone: string;
  email?: string | null;
  tags: string[];
  attributes: Record<string, string>;
}

export interface ChatBotSession {
  id: number;
  chatbot_id: number;
  name: string;
  wait: string | null;
  node: string;
  started_at: string;
}

export interface BotExport {
  format: string;
  version: number;
  name: string;
  bot: BotMeta;
  graph: BotGraph;
}

const C = CUSTOMER_ENDPOINTS.CHATBOTS;

export const chatbotsApi = {
  list: () => request<Chatbot[]>("GET", C.LIST),
  starters: () => request<Starter[]>("GET", C.STARTERS),
  get: (id: number) => request<ChatbotDetail>("GET", C.ONE(id)),
  create: (body: Partial<BotMeta> & { name: string; starter?: string | null }) =>
    request<ChatbotDetail>("POST", C.LIST, body),
  update: (id: number, body: BotMeta) => request<Chatbot>("PUT", C.ONE(id), body),
  saveGraph: (id: number, graph: BotGraph) =>
    request<Chatbot & { problems: Problems }>("PUT", C.ACTION(id, "graph"), { graph }),
  publish: (id: number) => request<Chatbot & { problems: Problems }>("POST", C.ACTION(id, "publish")),
  discard: (id: number) => request<ChatbotDetail>("POST", C.ACTION(id, "discard")),
  setActive: (id: number, active: boolean) => request<Chatbot>("PUT", C.ACTION(id, "active"), { active }),
  duplicate: (id: number) => request<Chatbot>("POST", C.ACTION(id, "duplicate")),
  remove: (id: number) => request<null>("DELETE", C.ONE(id)),
  exportBot: (id: number) => request<BotExport>("GET", C.ACTION(id, "export")),
  importBot: (body: { name: string; bot: BotMeta; graph: BotGraph }) =>
    request<Chatbot>("POST", C.IMPORT, body),
  report: (id: number, days: number) =>
    request<BotReport>("GET", withQuery(C.ACTION(id, "report"), { days })),
  simulate: (
    id: number,
    body: {
      graph?: BotGraph;
      settings?: BotSettings;
      state?: SimState | null;
      input?: { text?: string; reply_id?: string; media?: boolean } | null;
      contact?: SimContact;
    }
  ) => request<SimResult>("POST", C.ACTION(id, "simulate"), body),
  live: () =>
    request<{ id: number; name: string; active: boolean; description: string | null }[]>("GET", C.LIVE),
  startInChat: (id: number, conversation_id: number) =>
    request<ChatBotSession>("POST", C.ACTION(id, "start"), { conversation_id }),
  stopInChat: (conversation_id: number) => request<null>("POST", C.STOP, { conversation_id }),
};

export const CHATBOTS_QK = {
  ALL: ["chatbots"] as const,
  LIST: ["chatbots", "list"] as const,
  ONE: (id: number) => ["chatbots", id] as const,
  REPORT: (id: number, days: number) => ["chatbots", id, "report", days] as const,
  LIVE: ["chatbots", "live"] as const,
};

export const TRIGGER_LABELS: Record<BotTrigger, { label: string; hint: string }> = {
  keyword: { label: "Keywords", hint: "When a customer sends one of your keywords" },
  new_chat: { label: "New chat", hint: "The first time someone messages you" },
  any: { label: "Any message", hint: "When nothing else answers (takes the place of the default reply)" },
  ad: { label: "Ad click", hint: "When someone writes after tapping a Click-to-WhatsApp ad" },
  manual: { label: "Started by your team", hint: "From the inbox, an automatic reply or another chatbot" },
};

export function triggerSummary(bot: Pick<BotMeta, "trigger" | "keywords" | "match">): string {
  if (bot.trigger === "keyword") {
    const words = bot.keywords
      .slice(0, 4)
      .map((k) => `“${k}”`)
      .join(", ");
    return `${bot.match === "exact" ? "Message is" : bot.match === "starts_with" ? "Starts with" : "Contains"} ${words}${bot.keywords.length > 4 ? ` +${bot.keywords.length - 4}` : ""}`;
  }
  return TRIGGER_LABELS[bot.trigger].hint;
}
