import { getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

export type HealthStatus = "ok" | "warning" | "error" | "info";

export interface HealthCheck {
  key: string;
  label: string;
  status: HealthStatus;
  value: string | null;
  message: string;
  hint: string | null;
}

export interface HealthGroup {
  key: string;
  label: string;
  icon: string;
  status: HealthStatus;
  checks: HealthCheck[];
}

export interface HealthSummary {
  status: HealthStatus;
  ok: number;
  warnings: number;
  errors: number;
  info: number;
  total: number;
  checked_at: string;
}

export interface HealthResult {
  groups: HealthGroup[];
  summary: HealthSummary;
}

export interface FolderSize {
  key: string;
  label: string;
  path: string;
  bytes: number;
  complete: boolean;
}

export interface HealthSizes {
  folders: FolderSize[];
  database: { label: string; bytes: number | null };
}

const E = ADMIN_ENDPOINTS.SYSTEM_HEALTH;

export const systemHealthApi = {
  checks: () => getOne<HealthResult>(E.CHECKS),
  summary: () => getOne<{ errors: number; warnings: number; checked_at: string }>(E.SUMMARY),
  sizes: () => getOne<HealthSizes>(E.SIZES),
  mailCheck: () => send<{ ok: boolean; seconds: number }>("post", E.MAIL_CHECK),
  clearCache: () => send<null>("post", E.CLEAR_CACHE),
};
