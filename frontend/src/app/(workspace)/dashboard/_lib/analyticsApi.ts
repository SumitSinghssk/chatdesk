import { request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";

export interface Kpis {
  received: number;
  sent: number;
  failed: number;
  delivered: number;
  read: number;
  delivery_rate: number | null;
  read_rate: number | null;
  new_chats: number;
  resolved: number;
  new_contacts: number;
  opted_out: number;
  responses: number;
  avg_response_seconds: number | null;
  within_5_min: number | null;
  campaign_messages: number;
  bot_chats: number;
  bot_completed: number;
  auto_replies: number;
}

export interface DailyRow {
  date: string;
  received: number;
  sent: number;
  new_chats: number;
  resolved: number;
  new_contacts: number;
}

export interface AnalyticsReport {
  period: {
    start: string;
    end: string;
    days: number;
    timezone: string;
    previous: { start: string; end: string };
  };
  kpis: Kpis;
  previous: Kpis;
  daily: DailyRow[];
  /** 7 rows (Mon..Sun) × 24 hours: messages customers sent */
  heatmap: number[][];
  sources: { team: number; campaigns: number; automation: number; chatbots: number };
  team: {
    id: number;
    name: string;
    role: string;
    replies: number;
    resolved: number;
    open_chats: number;
    responses: number;
    avg_response_seconds: number | null;
    within_5_min: number | null;
  }[];
  campaigns: {
    id: number;
    name: string;
    status: string;
    template_name: string;
    started_at: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    clicked: number;
    failed: number;
    cost: number;
  }[];
  chatbots: {
    id: number;
    name: string;
    active: boolean;
    started: number;
    completed: number;
    handover: number;
    dropped: number;
    completion_rate: number | null;
  }[];
  auto_replies: { id: number; name: string; trigger: string; sent: number }[];
  now: {
    open: number;
    pending: number;
    waiting: number;
    unassigned: number;
    contacts: number;
    bots_talking: number;
  };
}

export type RangeQuery = { days: number } | { start: string; end: string };

export const analyticsApi = {
  report: (q: RangeQuery) =>
    request<AnalyticsReport>(
      "GET",
      withQuery(CUSTOMER_ENDPOINTS.ANALYTICS, q as Record<string, string | number>)
    ),
};

export const ANALYTICS_QK = {
  REPORT: (q: RangeQuery) => ["analytics", q] as const,
};
