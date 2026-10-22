import api from "./client";
import { cleanParams, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse, ListParams, Paginated, PaginationMeta } from "./types";

const E = ADMIN_ENDPOINTS.SECURITY;

export interface FirewallSettings {
  auto_block: boolean;
  auto_block_after: number;
  auto_block_window: number;
  auto_block_minutes: number;
  log_days: number;
}

export type BlockDuration = "1h" | "1d" | "1w" | "forever";

export const BLOCK_DURATION_OPTIONS: { value: BlockDuration; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "forever", label: "Until I unblock it" },
];

export interface IpBlock {
  id: number;
  ip: string;
  reason: string | null;
  automatic: boolean;
  expires_at: string | null;
  expired: boolean;
  created_by: { id: number; name: string | null } | null;
  hits: number;
  last_hit_at: string | null;
  created_at: string;
}

export interface BlockedRequest {
  id: number;
  ip: string;
  reason: string;
  reason_label: string;
  method: string | null;
  path: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface BlockedRequestPage extends Paginated<BlockedRequest> {
  summary: Record<string, number>;
  reasons: Record<string, string>;
}

export interface IpBlockPayload {
  ip: string;
  reason?: string | null;
  duration: BlockDuration;
}

export const securityApi = {
  blocks: async () => {
    const res = await api.get<ApiResponse<IpBlock[]> & { your_ip: string | null }>(E.BLOCKS);
    return { items: res.data.data, yourIp: res.data.your_ip };
  },
  block: (payload: IpBlockPayload) => send<IpBlock>("post", E.BLOCKS, payload),
  unblock: (id: number) => send<null>("delete", E.BLOCK(id)),
  requests: async (params: ListParams, signal?: AbortSignal): Promise<BlockedRequestPage> => {
    const res = await api.get<
      ApiResponse<BlockedRequest[]> & {
        meta: PaginationMeta;
        summary: Record<string, number>;
        reasons: Record<string, string>;
      }
    >(E.REQUESTS, { params: cleanParams({ page: 1, ...params }), signal });
    return {
      items: res.data.data,
      meta: res.data.meta,
      summary: res.data.summary ?? {},
      reasons: res.data.reasons ?? {},
    };
  },
  clearRequests: () => send<null>("delete", E.REQUESTS),
};
