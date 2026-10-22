import api from "./client";
import { cleanParams, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse, ListParams, PaginationMeta, Status } from "./types";
import type { RedirectCode } from "./redirectsApi";

export type NotFoundTab = "open" | "redirected" | "ignored" | "all";
export type NotFoundSort = "latest" | "hits" | "oldest";

export interface NotFoundLog {
  id: number;
  path: string;
  hits: number;
  last_referrer: string | null;
  last_user_agent: string | null;
  ignored: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
  has_redirect: boolean;
  redirect: { id: number; target_url: string; status_code: RedirectCode; status: Status } | null;
}

export type NotFoundCounts = Record<NotFoundTab, number>;

export interface NotFoundStats extends NotFoundCounts {
  total_hits: number;
  last_24h: number;
  new_this_week: number;
  new_last_week: number;
  top: { id: number; path: string; hits: number } | null;
}

const E = ADMIN_ENDPOINTS.NOT_FOUND;

export const notFoundApi = {
  async page(params: ListParams, tab: NotFoundTab, signal?: AbortSignal) {
    const res = await api.get<ApiResponse<NotFoundLog[]> & { meta: PaginationMeta; counts: NotFoundCounts }>(
      E.LIST,
      {
        params: { ...cleanParams({ page: 1, ...params }), tab },
        signal,
      }
    );
    return { items: res.data.data, meta: res.data.meta, counts: res.data.counts };
  },
  stats: () => getOne<NotFoundStats>(`${E.LIST}stats`),
  redirect: (id: number, target_url: string, status_code: RedirectCode) =>
    send<{ id: number }>("post", E.REDIRECT, { id, target_url, status_code }),
  ignore: (ids: number[]) => send<null>("post", E.IGNORE, { ids }),
  unignore: (ids: number[]) => send<null>("post", E.UNIGNORE, { ids }),
  remove: (ids: number[]) => send<null>("delete", E.DELETE, { ids }),
  clear: () => send<null>("delete", E.CLEAR),
};
