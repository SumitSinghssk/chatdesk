import api from "./client";
import { getList, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse } from "./types";

export interface LogFile {
  name: string;
  date: string | null;
  size: number;
  modified_at: string;
  errors?: number | null;
  warnings?: number | null;
}

export interface LogContent extends LogFile {
  lines: string[];
  line_count: number;
}

export interface LogStats {
  files: number;
  total_size: number;
  errors_today: number | null;
  warnings_today: number | null;
  errors_total: number;
  latest_at: string | null;
}

const E = ADMIN_ENDPOINTS.LOGS;

export const logsApi = {
  list: () => getList<LogFile>(E.LIST),
  stats: () => getOne<LogStats>(`${E.LIST}stats`),
  async read(name: string, lines: number, signal?: AbortSignal) {
    const res = await api.get<ApiResponse<LogContent>>(E.SHOW(name), { params: { lines }, signal });
    return res.data.data;
  },
  remove: (name: string) => send<null>("delete", E.DELETE(name)),
  clear: () => send<null>("delete", E.CLEAR),
};
