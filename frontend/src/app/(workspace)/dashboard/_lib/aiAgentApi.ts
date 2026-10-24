import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

const A = CUSTOMER_ENDPOINTS.AI_AGENT;

export type ProviderKey =
  "anthropic" | "openai" | "gemini" | "groq" | "deepseek" | "mistral" | "openrouter" | "custom";

export interface Provider {
  key: ProviderKey;
  label: string;
  company: string;
  keys_url: string | null;
  prefix: string;
  base_url: string | null;
  models: string[];
  hint: string;
  prices: Record<string, [number, number]>;
}

export interface Connection {
  id: number;
  provider: ProviderKey;
  provider_label: string;
  label: string;
  key_hint: string;
  base_url: string | null;
  status: "ok" | "failed" | "unchecked";
  error: string | null;
  checked_at: string | null;
  models: string[];
  prices: Record<string, [number, number]>;
  used_by: number;
  created_at: string;
}

export interface ConnectionInput {
  provider: ProviderKey;
  label: string;
  api_key?: string | null;
  base_url?: string | null;
  prices?: Record<string, [number, number]>;
}

export interface Handover {
  enabled: boolean;
  when_unsure: boolean;
  when_asked: boolean;
  when_upset: boolean;
  keywords: string[];
  message: string;
  assign: "auto" | "nobody";
}

export interface Behaviour {
  business_name: string;
  about: string;
  role: string;
  tone: "friendly" | "professional" | "casual" | "formal";
  language: string;
  length: "short" | "medium" | "detailed";
  scope: "strict" | "flexible";
  emoji: boolean;
  instructions: string;
  facts: { text: string }[];
  unknown_reply: string;
  handover: Handover;
  quality: "fast" | "balanced" | "best";
  knowledge_mode: "auto" | "full" | "search";
  cache_answers: boolean;
}

export interface Limits {
  monthly_budget: number;
  memory_messages: number;
  reply_tokens: number;
}

export interface WhatsAppChannel {
  mode: "always" | "outside_hours";
  pause_hours: number;
  media_reply: string;
}

export interface WidgetChannel {
  title: string;
  subtitle: string;
  greeting: string;
  color: string;
  position: "right" | "left";
  theme: "auto" | "light" | "dark";
  launcher_text: string;
  suggestions: string[];
  lead: "off" | "optional" | "required";
  lead_fields: ("name" | "phone" | "email")[];
  whatsapp_button: boolean;
  allowed_domains: string[];
  branding: boolean;
}

export type SourceKind = "file" | "url" | "text" | "faq";

export interface AgentSummary {
  id: number;
  name: string;
  model: string | null;
  connection: Connection | null;
  business_name: string;
  whatsapp_enabled: boolean;
  widget_enabled: boolean;
  api_enabled: boolean;
  knowledge: {
    version: number;
    trained_at: string | null;
    tokens: number;
    needs_training: boolean;
    mode: "full" | "search";
    sources: Partial<Record<SourceKind, number>>;
  };
  problem: string | null;
  stats: { replies?: number; cost?: number; handovers?: number; conversations?: number };
  created_at: string;
  updated_at: string;
}

export interface Agent extends AgentSummary {
  behaviour: Behaviour;
  limits: Limits;
  whatsapp: WhatsAppChannel;
  widget: WidgetChannel;
  public_key: string;
  secret_hint: string | null;
  month_cost: number;
}

export interface Source {
  id: number;
  kind: SourceKind;
  title: string;
  filename: string | null;
  mime: string | null;
  size: number | null;
  url: string | null;
  pages: number | null;
  chars: number;
  tokens: number;
  status: "ready" | "failed" | "pending";
  error: string | null;
  enabled: boolean;
  trained: boolean;
  has_file: boolean;
  excerpt: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceDetail extends Source {
  content: string;
  chunks: { position: number; heading: string | null; text: string; tokens: number }[];
}

export interface SourceRef {
  id: number;
  title: string;
  kind: SourceKind;
}

export type Outcome = "answered" | "handover" | "unknown" | "failed" | "cached";

export interface ReplyInfo {
  id: number;
  text: string;
  outcome: Outcome;
  sources: SourceRef[];
  tokens: { input: number; output: number; cached: number };
  cost: number;
  saved: number;
  latency_ms: number | null;
  model: string | null;
  mode?: "full" | "search";
  handover?: boolean;
}

export interface ThreadRow {
  id: number;
  channel: "whatsapp" | "web" | "api" | "test";
  status: "active" | "handover" | "paused";
  visitor: { name?: string; phone?: string; email?: string; page?: string; host?: string };
  conversation_id: number | null;
  handover_reason: string | null;
  handover_at: string | null;
  summary: string | null;
  messages: number;
  last_message_at: string | null;
  created_at: string;
  last: { role: string; text: string; outcome: Outcome | null } | null;
}

export interface ThreadMessage extends Omit<ReplyInfo, "outcome"> {
  role: "user" | "assistant";
  outcome: Outcome | null;
  feedback: "up" | "down" | null;
  error: string | null;
  created_at: string;
}

export interface Usage {
  days: number;
  replies: number;
  outcomes: Partial<Record<Outcome | "none", number>>;
  tokens: { input: number; output: number; cached: number };
  cost: number;
  saved: number;
  memory_cost: number;
  cache_hits: number;
  cache_hits_total: number;
  avg_latency_ms: number | null;
  feedback: { up: number; down: number };
  channels: Partial<Record<ThreadRow["channel"], number>>;
  daily: { date: string; replies: number; cost: number; handovers: number }[];
  month_cost: number;
  budget: number;
}

export interface Miss {
  question: string;
  count: number;
  last_at: string;
  thread_id: number;
  reason: "unknown" | "handover" | "disliked";
  reply: string;
}

export interface SearchHit {
  source_id: number;
  title: string;
  kind: SourceKind;
  heading: string | null;
  text: string;
  score: number;
}

export interface ChatState {
  agent: { id: number; name: string };
  state: "active" | "paused" | "handover" | "team";
  thread_id: number | null;
  handover_reason: string | null;
  problem: string | null;
}

export type AgentInput = Pick<Agent, "name" | "model" | "behaviour" | "limits"> & {
  connection_id: number | null;
};
export type ChannelsInput = Pick<
  Agent,
  "whatsapp_enabled" | "whatsapp" | "widget_enabled" | "widget" | "api_enabled"
>;

const headers = { Accept: "application/json", "X-Requested-With": "sk-web" };
export const apiUrl = (path: string) => `${BROWSER_API_BASE_URL}${path}`;

async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method: "POST", credentials: "same-origin", headers, body: form });
  } catch {
    throw new CustomerApiError("Can't reach the server. Please try again in a moment.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Object.fromEntries(
      Object.entries((body.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0] ?? ""])
    );
    throw new CustomerApiError(errors.file || body.message || "Upload failed.", res.status, errors);
  }
  return body.data as T;
}

export { readStream, type StreamHandlers } from "@/lib/sse";

export const aiAgentApi = {
  providers: () => request<Provider[]>("GET", A.PROVIDERS),
  connections: () => request<Connection[]>("GET", A.CONNECTIONS),
  addConnection: (body: ConnectionInput) => request<Connection>("POST", A.CONNECTIONS, body),
  editConnection: (id: number, body: ConnectionInput) => request<Connection>("PUT", A.CONNECTION(id), body),
  checkConnection: (id: number) => request<Connection>("POST", `${A.CONNECTION(id)}/check`),
  removeConnection: (id: number) => request<null>("DELETE", A.CONNECTION(id)),

  agents: () => request<AgentSummary[]>("GET", A.AGENTS),
  create: (body: {
    name: string;
    starter: string;
    connection_id?: number | null;
    model?: string | null;
    business_name?: string;
  }) => request<Agent>("POST", A.AGENTS, body),
  get: (id: number) => request<Agent>("GET", A.AGENT(id)),
  update: (id: number, body: AgentInput) => request<Agent>("PUT", A.AGENT(id), body),
  channels: (id: number, body: ChannelsInput) => request<Agent>("PUT", `${A.AGENT(id)}/channels`, body),
  secret: (id: number) => request<{ secret: string; agent: Agent }>("POST", `${A.AGENT(id)}/secret`),
  publicKey: (id: number) => request<Agent>("POST", `${A.AGENT(id)}/public-key`),
  duplicate: (id: number) => request<Agent>("POST", `${A.AGENT(id)}/duplicate`),
  remove: (id: number) => request<null>("DELETE", A.AGENT(id)),

  sources: (id: number) => request<Source[]>("GET", `${A.AGENT(id)}/sources`),
  source: (id: number, sourceId: number) => request<SourceDetail>("GET", A.SOURCE(id, sourceId)),
  sourceFileUrl: (id: number, sourceId: number) => apiUrl(`${A.SOURCE(id, sourceId)}/file`),
  addFile: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<Source>(`${A.AGENT(id)}/sources/file`, form);
  },
  addText: (id: number, body: { title: string; content: string }) =>
    request<Source>("POST", `${A.AGENT(id)}/sources/text`, body),
  addFaq: (id: number, body: { question: string; answer: string }) =>
    request<Source>("POST", `${A.AGENT(id)}/sources/faq`, body),
  addUrl: (id: number, body: { url: string; crawl: boolean; max_pages: number }) =>
    request<Source>("POST", `${A.AGENT(id)}/sources/url`, body),
  updateSource: (
    id: number,
    sourceId: number,
    body: { enabled?: boolean; title?: string; content?: string }
  ) => request<Source>("PUT", A.SOURCE(id, sourceId), body),
  refreshSource: (id: number, sourceId: number) =>
    request<Source>("POST", `${A.SOURCE(id, sourceId)}/refresh`),
  removeSource: (id: number, sourceId: number) => request<null>("DELETE", A.SOURCE(id, sourceId)),
  train: (id: number) =>
    request<{ agent: Agent; passages: number; sources: number; tokens: number }>(
      "POST",
      `${A.AGENT(id)}/train`
    ),
  search: (id: number, q: string) => request<SearchHit[]>("GET", withQuery(`${A.AGENT(id)}/search`, { q })),

  test: (id: number, body: { message: string; thread_id: number | null; channel: "web" | "whatsapp" }) =>
    fetch(apiUrl(`${A.AGENT(id)}/test`), {
      method: "POST",
      credentials: "same-origin",
      headers: { ...headers, Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  threads: (id: number, params: { channel?: string; status?: string; page?: number }) =>
    request<ThreadRow[]>("GET", withQuery(`${A.AGENT(id)}/threads`, params)),
  thread: (id: number, threadId: number) =>
    request<ThreadRow & { items: ThreadMessage[] }>("GET", `${A.AGENT(id)}/threads/${threadId}`),
  feedback: (id: number, messageId: number, value: "up" | "down" | null) =>
    request<ThreadMessage>("POST", `${A.AGENT(id)}/messages/${messageId}/feedback`, { value }),
  usage: (id: number, days: number) => request<Usage>("GET", withQuery(`${A.AGENT(id)}/usage`, { days })),
  unanswered: (id: number) => request<Miss[]>("GET", `${A.AGENT(id)}/unanswered`),

  chatState: (conversationId: number) => request<ChatState | null>("GET", A.CHAT(conversationId)),
  pauseChat: (conversationId: number) => request<null>("POST", `${A.CHAT(conversationId)}/pause`),
  resumeChat: (conversationId: number) => request<null>("POST", `${A.CHAT(conversationId)}/resume`),
};

export const AI_QK = {
  ALL: ["ai-agent"] as const,
  PROVIDERS: ["ai-agent", "providers"] as const,
  CONNECTIONS: ["ai-agent", "connections"] as const,
  AGENTS: ["ai-agent", "agents"] as const,
  AGENT: (id: number) => ["ai-agent", "agent", id] as const,
  SOURCES: (id: number) => ["ai-agent", "agent", id, "sources"] as const,
  SOURCE: (id: number, sourceId: number) => ["ai-agent", "agent", id, "source", sourceId] as const,
  THREADS: (id: number, params: object) => ["ai-agent", "agent", id, "threads", params] as const,
  THREAD: (id: number, threadId: number) => ["ai-agent", "agent", id, "thread", threadId] as const,
  USAGE: (id: number, days: number) => ["ai-agent", "agent", id, "usage", days] as const,
  MISSES: (id: number) => ["ai-agent", "agent", id, "unanswered"] as const,
  CHAT: (conversationId: number) => ["ai-agent", "chat", conversationId] as const,
};

export const SOURCE_LABELS: Record<SourceKind, string> = {
  file: "File",
  url: "Web page",
  text: "Note",
  faq: "Q&A",
};

/** "$0.0042" style, with enough digits to see small amounts */
export function usd(value: number | null | undefined) {
  const v = value ?? 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

export const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
