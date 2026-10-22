import { createCrudApi, getOne } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { Status } from "./types";

export const REDIRECT_CODES = [301, 302, 307, 308] as const;
export type RedirectCode = (typeof REDIRECT_CODES)[number];

export const REDIRECT_CODE_LABELS: Record<RedirectCode, string> = {
  301: "301 Permanent",
  302: "302 Temporary",
  307: "307 Temporary (strict)",
  308: "308 Permanent (strict)",
};

export const REDIRECT_CODE_OPTIONS = REDIRECT_CODES.map((code) => ({
  value: String(code),
  label: REDIRECT_CODE_LABELS[code],
}));

export interface Redirect {
  id: number;
  source_path: string;
  target_url: string;
  status_code: RedirectCode;
  status: Status;
  hits: number;
  last_hit_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RedirectPayload {
  source_path: string;
  target_url: string;
  status_code: RedirectCode;
  status: Status;
  note?: string | null;
}

export interface RedirectStats {
  total: number;
  active: number;
  inactive: number;
  total_hits: number;
  hit_last_30_days: number;
  unused: number;
  by_code: Record<`${RedirectCode}`, number>;
}

export const redirectsApi = {
  ...createCrudApi<Redirect, RedirectPayload>(ADMIN_ENDPOINTS.REDIRECTS),
  stats: () => getOne<RedirectStats>(ADMIN_ENDPOINTS.REDIRECTS.STATS),
};
