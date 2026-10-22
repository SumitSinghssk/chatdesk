import api from "./client";
import { cleanParams, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse, ListParams, PaginationMeta } from "./types";

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string | null;
  url: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  today: number;
  unread_today: number;
  this_week: number;
  last_week: number;
  by_type: { type: string; count: number; unread: number }[];
}

export type NotificationBulkAction = "read" | "unread" | "delete";

const E = ADMIN_ENDPOINTS.NOTIFICATIONS;

export const notificationsApi = {
  async latest() {
    const res = await api.get<ApiResponse<AppNotification[]> & { unread_count: number }>(E.LATEST);
    return { items: res.data.data, unread: res.data.unread_count };
  },
  async page(params: ListParams & { unread?: boolean }, signal?: AbortSignal) {
    const { unread, ...rest } = params;
    const res = await api.get<
      ApiResponse<AppNotification[]> & { meta: PaginationMeta; unread_count: number }
    >(E.LIST, {
      params: cleanParams({ page: 1, ...rest, ...(unread ? { unread: true } : {}) }),
      signal,
    });
    return { items: res.data.data, meta: res.data.meta, unread: res.data.unread_count };
  },
  stats: () => getOne<NotificationStats>(`${E.LIST}stats`),
  markRead: (id: number) => send<AppNotification>("post", E.MARK_READ(id)),
  markUnread: (id: number) => send<AppNotification>("post", `${E.LIST}${id}/unread`),
  markAllRead: () => send<null>("post", E.MARK_ALL_READ),
  bulk: (ids: number[], action: NotificationBulkAction) =>
    send<null>("post", `${E.LIST}bulk`, { ids, action }),
  remove: (id: number) => send<null>("delete", E.DELETE(id)),
};
