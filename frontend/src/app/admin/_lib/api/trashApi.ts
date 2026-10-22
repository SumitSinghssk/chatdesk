import { getList, getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ListParams } from "./types";

export interface TrashType {
  type: string;
  label: string;
  count: number;
}

export interface TrashItem {
  id: number;
  title: string;
  subtitle: string | null;
  deleted_at: string;
}

export interface RestoreResult {
  restored: number;
  skipped: { id: number; reason: string }[];
}

export interface TrashStats {
  total: number;
  by_type: (TrashType & { stale: number })[];
  stale: number;
  stale_days: number;
  oldest: { type: string; label: string; deleted_at: string } | null;
}

const E = ADMIN_ENDPOINTS.TRASH;

export const trashApi = {
  summary: () => getList<TrashType>(E.SUMMARY),
  stats: () => getOne<TrashStats>(`${E.SUMMARY}stats`),
  page: (type: string, params: ListParams, signal?: AbortSignal) =>
    getPage<TrashItem>(E.LIST(type), params, signal),
  restore: (type: string, ids: number[]) => send<RestoreResult>("post", E.RESTORE(type), { ids }),
  deleteForever: (type: string, ids: number[]) => send<null>("delete", E.DELETE(type), { ids }),
  empty: (type: string) => send<null>("delete", E.EMPTY(type)),
};
