import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";

export type Trigger = "keyword" | "welcome" | "away" | "default";
export type MatchType = "exact" | "contains" | "starts_with";
export type ReplyType = "text" | "media" | "buttons" | "list" | "location";
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Reply {
  type: ReplyType;
  text?: string | null;
  media_key?: string | null;
  media_kind?: "image" | "video" | "document" | null;
  media_filename?: string | null;
  header?: string | null;
  footer?: string | null;
  buttons?: string[];
  list_button?: string | null;
  rows?: { title: string; description?: string | null }[];
  latitude?: number | null;
  longitude?: number | null;
  place?: string | null;
  address?: string | null;
}

export interface Rule {
  id: number;
  name: string;
  trigger: Trigger;
  match: MatchType;
  keywords: string[];
  reply: Reply;
  cooldown_minutes: number;
  active: boolean;
  position: number;
  hits: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleInput {
  name: string;
  trigger: Trigger;
  match: MatchType;
  keywords: string[];
  reply: Reply;
  cooldown_minutes: number;
  active: boolean;
}

export interface AutomationSettings {
  timezone: string;
  hours: Record<Day, { open: boolean; start: string; end: string }>;
  away_when_nobody_available: boolean;
  opt_out_keywords: string[];
  opt_out_reply: string | null;
  opt_in_keywords: string[];
  opt_in_reply: string | null;
  open_now?: boolean;
}

export interface TryResult {
  matches: { kind: string; reason: string; rule: Rule | null; reply: Reply | null }[];
  open_now: boolean;
}

const A = CUSTOMER_ENDPOINTS.AUTOMATION;

export const automationApi = {
  rules: () => request<Rule[]>("GET", A.RULES),
  save: (body: RuleInput, id?: number) =>
    id ? request<Rule>("PUT", A.RULE(id), body) : request<Rule>("POST", A.RULES, body),
  setActive: (id: number, active: boolean) => request<Rule>("PUT", A.ACTIVE(id), { active }),
  remove: (id: number) => request<null>("DELETE", A.RULE(id)),
  reorder: (ids: number[]) => request<null>("PUT", A.ORDER, { ids }),
  settings: () => request<AutomationSettings>("GET", A.SETTINGS),
  saveSettings: (body: AutomationSettings) => request<AutomationSettings>("PUT", A.SETTINGS, body),
  tryMessage: (text: string, first_message: boolean) =>
    request<TryResult>("POST", A.TRY, { text, first_message }),
};

export const AUTOMATION_QK = {
  ALL: ["automation"] as const,
  RULES: ["automation", "rules"] as const,
  SETTINGS: ["automation", "settings"] as const,
};
