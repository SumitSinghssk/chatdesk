import { getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ListParams } from "./types";

export interface ActivityLog {
  id: number;
  user_id: number | null;
  user: { id: number; name: string; email: string } | null;
  user_email: string | null;
  action: string;
  subject_type: string | null;
  subject_id: number | null;
  subject_label: string | null;
  description: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  browser: string | null;
  platform: string | null;
  device: string | null;
  created_at: string;
}

export interface ActivityStats {
  total: number;
  last_30_days: number;
  logins: number;
  failed_logins: number;
  created: number;
  updated: number;
  deleted: number;
  actions: string[];
  today: number;
  this_week: number;
  last_week: number;
  active_users: number;
  active_users_30_days: number;
  by_action: Record<string, number>;
  subject_types: string[];
  users: { id: number; name: string }[];
}

const E = ADMIN_ENDPOINTS.ACTIVITY_LOGS;

export const activityLogsApi = {
  page: (params: ListParams, signal?: AbortSignal) => getPage<ActivityLog>(E.LIST, params, signal),
  get: (id: number) => getOne<ActivityLog>(E.SHOW(id)),
  stats: () => getOne<ActivityStats>(E.STATS),
  clear: () => send<null>("delete", E.CLEAR),
};
