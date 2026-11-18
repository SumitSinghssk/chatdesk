import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";

export type WaCallStatus =
  | "ringing"
  | "answering"
  | "answered"
  | "ended"
  | "missed"
  | "declined"
  | "failed"
  | "dialing"
  | "rejected"
  | "no_answer";

export interface WaCall {
  id: number;
  conversation_id: number;
  direction: "in" | "out";
  status: WaCallStatus;
  contact: { name: string; phone: string } | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration: number | null;
  error: string | null;
  answered_by: { id: number; name: string | null } | null;
  /** the signed-in person is on this call */
  mine: boolean;
  /** outgoing: the customer's answer, for the person who placed the call */
  answer_sdp: string | null;
}

export interface CallPermission {
  status: "none" | "requested" | "temporary" | "permanent" | "rejected" | "expired";
  expires_at: string | null;
  requested_at: string | null;
  can_call: boolean;
  can_request: boolean;
  reason: string | null;
  warning: string | null;
  calling_on: boolean;
}

export interface WaCallSettings {
  enabled: boolean;
  followup_on: boolean;
  followup_text: string;
  permission_text: string;
  synced_at: string | null;
  sync_error: string | null;
}

const C = CUSTOMER_ENDPOINTS.WA_CALLS;

export const WA_CALLS_QK = {
  SETTINGS: ["wa-calls", "settings"] as const,
  RINGING: ["wa-calls", "ringing"] as const,
  PERMISSION: (conversationId: number) => ["wa-calls", "permission", conversationId] as const,
};

export const waCallsApi = {
  settings: () => request<WaCallSettings>("GET", C.SETTINGS),
  saveSettings: (body: Omit<WaCallSettings, "synced_at" | "sync_error">) =>
    request<WaCallSettings>("PUT", C.SETTINGS, body),
  ringing: () => request<{ enabled: boolean; ringing: WaCall[]; active: WaCall | null }>("GET", C.RINGING),
  get: (id: number) => request<WaCall>("GET", C.ONE(id)),
  claim: (id: number) => request<{ id: number; offer_sdp: string | null }>("POST", C.ACTION(id, "claim")),
  answer: (id: number, sdp: string) => request<WaCall>("POST", C.ACTION(id, "answer"), { sdp }),
  decline: (id: number) => request<WaCall>("POST", C.ACTION(id, "decline")),
  hangup: (id: number) => request<WaCall>("POST", C.ACTION(id, "hangup")),
  permission: (conversationId: number) => request<CallPermission>("GET", C.PERMISSION(conversationId)),
  requestPermission: (conversationId: number) =>
    request<CallPermission>("POST", C.PERMISSION(conversationId)),
  start: (conversationId: number, sdp: string) => request<WaCall>("POST", C.START(conversationId), { sdp }),
};
