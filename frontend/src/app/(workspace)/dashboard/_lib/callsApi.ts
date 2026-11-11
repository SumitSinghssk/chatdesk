import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery, type QueryParams } from "@/config/routes";
import { BROWSER_API_BASE_URL } from "@/config/site";

export type CallOutcome = "pending" | "answered" | "missed" | "not_connected" | "unknown";
export type CallDirection = "inbound" | "outbound";

export interface CallLog {
  id: number;
  provider: string;
  call_sid: string;
  direction: CallDirection;
  from_number: string | null;
  to_number: string | null;
  customer_number: string | null;
  contact: { id: number; name: string } | null;
  outcome: CallOutcome;
  provider_status: string | null;
  duration: number;
  started_at: string | null;
  ended_at: string | null;
  follow_up: "sent" | "failed" | "skipped" | null;
  follow_up_note: string | null;
  recording: { status: "none" | "pending" | "saved" | "failed"; available: boolean; size: number | null };
  created_at: string;
}

export interface CallPage {
  items: CallLog[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

/** What to send on WhatsApp after a call. */
export interface CallRule {
  on: boolean;
  /** sent while the 24-hour chat window is open; {name} {business} {time} {duration} are filled in */
  text: string;
  /** sent when the window is closed (or there's no text) */
  template_id: number | null;
}

export interface ProviderField {
  name: string;
  label: string;
  required: boolean;
  secret: boolean;
  default: string;
  help: string;
  options: { value: string; label: string }[];
}

export interface CallProvider {
  key: string;
  label: string;
  website: string;
  fields: ProviderField[];
  setup_help: string;
}

export interface CallSettings {
  connected: boolean;
  provider: string;
  providers: CallProvider[];
  /** secret fields are true/false: saved or not */
  config: Record<string, string | boolean | null>;
  status: "pending" | "connected" | "error" | null;
  last_error: string | null;
  last_event_at: string | null;
  callback_url: string | null;
  answered: CallRule;
  missed: CallRule;
  min_answered_seconds: number;
  record_calls: boolean;
  save_recordings: boolean;
  agent_number: string | null;
}

export type CallSettingsInput = Pick<
  CallSettings,
  "answered" | "missed" | "min_answered_seconds" | "record_calls" | "save_recordings" | "agent_number"
>;

const K = CUSTOMER_ENDPOINTS.CALLS;

export const CALLS_QK = {
  LIST: ["calls", "list"] as const,
  SETTINGS: ["calls", "settings"] as const,
};

export const callsApi = {
  async page(params: QueryParams, signal?: AbortSignal): Promise<CallPage> {
    const res = await fetch(
      `${BROWSER_API_BASE_URL}${withQuery(K.LIST, { page: 1, per_page: 25, ...params })}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "X-Requested-With": "sk-web" },
        signal,
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new CustomerApiError(body.message ?? "Couldn't load calls.", res.status);
    return { items: body.data ?? [], meta: body.meta };
  },
  start: (body: { to: string; agent_number?: string }) => request<CallLog>("POST", K.LIST, body),
  settings: () => request<CallSettings>("GET", K.SETTINGS),
  saveSettings: (body: CallSettingsInput) => request<CallSettings>("PUT", K.SETTINGS, body),
  connect: (body: { provider: string; config: Record<string, string> }) =>
    request<CallSettings>("PUT", K.CONNECTION, body),
  disconnect: () => request<CallSettings>("DELETE", K.CONNECTION),
  /** for <audio src>: the browser sends the session cookie itself */
  recordingUrl: (id: number, download = false) =>
    `${BROWSER_API_BASE_URL}${withQuery(K.RECORDING(id), { download: download || undefined })}`,
};
