import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";

export interface ApiKey {
  id: number;
  name: string;
  hint: string;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  /** only right after it's created */
  key?: string;
}

export interface WebhookEvent {
  event: string;
  description: string;
}

export interface Webhook {
  id: number;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  health: "ok" | "failing" | "new";
  failures_in_row: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_delivery: { status: string; response_status: number | null; at: string | null } | null;
  counts: { success: number; failed: number; pending: number };
  created_at: string;
  /** only when one webhook is opened */
  secret?: string;
}

export interface Delivery {
  id: number;
  event: string;
  event_id: string;
  status: "pending" | "success" | "failed";
  attempts: number;
  response_status: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  payload?: Record<string, unknown>;
  response_body?: string | null;
}

export interface WebhookInput {
  url: string;
  description?: string | null;
  events: string[];
  enabled: boolean;
}

const I = CUSTOMER_ENDPOINTS.INTEGRATIONS;

export const INTEGRATIONS_QK = {
  ALL: ["integrations"] as const,
  KEYS: ["integrations", "keys"] as const,
  EVENTS: ["integrations", "events"] as const,
  WEBHOOKS: ["integrations", "webhooks"] as const,
  WEBHOOK: (id: number) => ["integrations", "webhooks", id] as const,
  DELIVERIES: (id: number, status: string, page: number) =>
    ["integrations", "webhooks", id, "deliveries", status, page] as const,
};

export const integrationsApi = {
  keys: () => request<ApiKey[]>("GET", I.KEYS),
  createKey: (name: string) => request<ApiKey>("POST", I.KEYS, { name }),
  deleteKey: (id: number) => request<null>("DELETE", I.KEY(id)),
  events: () => request<WebhookEvent[]>("GET", I.EVENTS),
  webhooks: () => request<Webhook[]>("GET", I.WEBHOOKS),
  webhook: (id: number) => request<Webhook>("GET", I.WEBHOOK(id)),
  saveWebhook: (body: WebhookInput, id?: number) =>
    id ? request<Webhook>("PUT", I.WEBHOOK(id), body) : request<Webhook>("POST", I.WEBHOOKS, body),
  deleteWebhook: (id: number) => request<null>("DELETE", I.WEBHOOK(id)),
  rollSecret: (id: number) => request<Webhook>("POST", I.SECRET(id)),
  test: (id: number, event: string) => request<Delivery>("POST", I.TEST(id), { event }),
  deliveries: (id: number, status: string, page: number) =>
    request<Delivery[]>(
      "GET",
      withQuery(I.DELIVERIES(id), { status: status === "all" ? undefined : status, page, per_page: 20 })
    ),
  delivery: (id: number, deliveryId: number) => request<Delivery>("GET", I.DELIVERY(id, deliveryId)),
  resend: (id: number, deliveryId: number) => request<Delivery>("POST", I.RESEND(id, deliveryId)),
};

/** Events grouped for the picker and the docs. */
export const EVENT_GROUPS: { label: string; prefix: string }[] = [
  { label: "Messages", prefix: "message." },
  { label: "Contacts", prefix: "contact." },
  { label: "Chats", prefix: "conversation." },
  { label: "Orders", prefix: "order." },
  { label: "Campaigns", prefix: "campaign." },
];
