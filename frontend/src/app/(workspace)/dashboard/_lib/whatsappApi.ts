import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";

export interface WhatsAppConnection {
  waba_id: string;
  phone_number_id: string;
  has_access_token: boolean;
  has_app_secret: boolean;
  verify_token: string;
  webhook_url: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  status: "pending" | "connected" | "error";
  last_error: string | null;
  webhook_verified_at: string | null;
  last_event_at: string | null;
  graph_api_version: string;
  updated_at: string | null;
}

export interface WhatsAppOverview {
  connection: WhatsAppConnection | null;
  counts: { messages: number; statuses: number; events: number };
  generated_at: string;
}

export interface ConnectionInput {
  waba_id: string;
  phone_number_id: string;
  access_token?: string;
  app_secret?: string;
}

const W = CUSTOMER_ENDPOINTS.WHATSAPP;

/** React Query keys for the workspace (the header chip, Overview and WhatsApp setup share them). */
export const WORKSPACE_QK = {
  ME: ["workspace", "me"] as const,
  OPTIONS: ["workspace", "auth-options"] as const,
  CONNECTION: ["workspace", "whatsapp", "connection"] as const,
  OVERVIEW: ["workspace", "whatsapp", "overview"] as const,
};

export const whatsappApi = {
  overview: () => request<WhatsAppOverview>("GET", W.OVERVIEW),
  connection: () => request<WhatsAppConnection | null>("GET", W.CONNECTION),
  save: (body: ConnectionInput) => request<WhatsAppConnection>("PUT", W.CONNECTION, body),
  refresh: () => request<WhatsAppConnection>("POST", W.REFRESH),
  sendTest: (body: { to: string; text: string }) =>
    request<{ message_id: string | null }>("POST", W.TEST_MESSAGE, body),
  disconnect: () => request<null>("DELETE", W.CONNECTION),
};
