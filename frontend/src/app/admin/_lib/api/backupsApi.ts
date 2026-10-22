import api from "./client";
import { cleanParams, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse, ListParams, PaginationMeta } from "./types";

export type BackupStatus = "running" | "completed" | "failed";
export type BackupFrequency = "daily" | "weekly" | "monthly";

export interface BackupDownload {
  file: string;
  label: string;
  size: number;
  url: string;
}

export interface Backup {
  id: number;
  name: string;
  trigger: "manual" | "scheduled";
  includes_database: boolean;
  includes_files: boolean;
  status: BackupStatus;
  stage: string | null;
  stalled: boolean;
  note: string | null;
  downloads: BackupDownload[];
  size: number;
  error: string | null;
  user: { id: number; name: string | null } | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface BackupListSummary {
  total_size: number;
  running_id: number | null;
}

export interface BackupStats extends BackupListSummary {
  total: number;
  completed: number;
  failed: number;
  failed_30d: number;
  last_success: { id: number; name: string; finished_at: string; size: number } | null;
  schedule_enabled: boolean;
  schedule_description: string;
  next_run_at: string | null;
}

export interface BackupSettings {
  enabled: boolean;
  frequency: BackupFrequency;
  time: string;
  weekday: number;
  monthday: number;
  include_database: boolean;
  include_files: boolean;
  keep: number;
}

export interface BackupSchedule {
  settings: BackupSettings;
  description: string;
  timezone: string;
  next_run_at: string | null;
  last_scheduler_run: string | null;
  scheduler_running: boolean;
  cron_command: {
    linux: string;
    windows: string;
    windows_note: string;
    is_windows: boolean;
    manual: string;
  };
}

const E = ADMIN_ENDPOINTS.BACKUPS;

export const backupsApi = {
  async page(params: ListParams, signal?: AbortSignal) {
    const res = await api.get<ApiResponse<Backup[]> & { meta: PaginationMeta; summary: BackupListSummary }>(
      E.LIST,
      {
        params: cleanParams({ page: 1, ...params }),
        signal,
      }
    );
    return { items: res.data.data, meta: res.data.meta, summary: res.data.summary };
  },
  stats: () => getOne<BackupStats>(`${E.LIST}stats`),
  get: (id: number) => getOne<Backup>(E.SHOW(id)),
  create: (payload: { include_database: boolean; include_files: boolean }) =>
    send<Backup>("post", E.CREATE, payload),
  remove: (id: number) => send<null>("delete", E.DELETE(id)),
  bulkDelete: (ids: number[]) =>
    send<{ deleted: number; skipped: number }>("post", `${E.LIST}bulk-delete`, { ids }),
  settings: () => getOne<BackupSchedule>(E.SETTINGS),
  saveSettings: (payload: BackupSettings) => send<BackupSchedule>("put", E.SETTINGS, payload),

  async download(backup: Backup, file: string) {
    const res = await api.get<Blob>(E.DOWNLOAD(backup.id, file), { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${backup.name}-${file}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
