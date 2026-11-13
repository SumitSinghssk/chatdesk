import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";

export type AssistAction = "suggest" | "summarize" | "translate" | "rewrite";
export type AssistTone = "friendly" | "professional" | "concise" | "apologetic";

export interface AssistSettings {
  enabled: boolean;
  connection_id: number | null;
  model: string | null;
  /** suggested replies use this AI agent's instructions and knowledge */
  agent_id: number | null;
  /** USD a month; null = no limit */
  monthly_budget: number | null;
  usage: { month_cost: number; by_action: Partial<Record<AssistAction, { uses: number; cost: number }>> };
  /** why it isn't working while turned on */
  problem: string | null;
}

export interface AssistStatus {
  enabled: boolean;
  ready: boolean;
  problem: string | null;
}

const S = CUSTOMER_ENDPOINTS.AI_ASSIST;

export const AI_ASSIST_QK = {
  SETTINGS: ["ai-assist", "settings"] as const,
  STATUS: ["ai-assist", "status"] as const,
};

export const aiAssistApi = {
  settings: () => request<AssistSettings>("GET", S.SETTINGS),
  saveSettings: (body: Omit<AssistSettings, "usage" | "problem">) =>
    request<AssistSettings>("PUT", S.SETTINGS, body),
  status: () => request<AssistStatus>("GET", S.STATUS),
  run: (
    conversationId: number,
    action: AssistAction,
    body: { text?: string; language?: string; tone?: AssistTone } = {}
  ) => request<{ action: AssistAction; text: string }>("POST", S.RUN(conversationId, action), body),
};
