import { getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { IdName, ListParams } from "./types";

export type CommentStatus = "pending" | "approved" | "rejected" | "spam";
export type CommentBulkAction = "approve" | "reject" | "spam" | "pending" | "delete";

export interface CommentThreadItem {
  id: number;
  parent_id: number | null;
  depth: number;
  author_name: string;
  body: string;
  status: CommentStatus;
  is_admin: boolean;
  created_at: string;
}

export interface Comment {
  id: number;
  blog_id: number;
  blog: { id: number; title: string; slug: string; comments_enabled: boolean } | null;
  parent_id: number | null;
  parent: { id: number; author_name: string; body: string; status: CommentStatus } | null;
  author_name: string;
  author_email: string | null;
  body: string;
  status: CommentStatus;
  is_admin: boolean;
  user: IdName | null;
  replies_count: number | null;
  ip_address: string | null;
  user_agent: string | null;
  approved_at: string | null;
  approved_by: IdName | null;
  created_at: string;
  updated_at: string;
  thread?: CommentThreadItem[];
}

export interface CommentPayload {
  author_name: string;
  author_email?: string | null;
  body: string;
}

export interface CommentStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
  admin_replies: number;
  today: number;
  this_week: number;
  last_week: number;
  blogs: { id: number; title: string }[];
}

const E = ADMIN_ENDPOINTS.COMMENTS;

export const commentsApi = {
  page: (params: ListParams, signal?: AbortSignal) => getPage<Comment>(E.LIST, params, signal),
  get: (id: number) => getOne<Comment>(E.SHOW(id)),
  stats: () => getOne<CommentStats>(E.STATS),
  update: (id: number, payload: CommentPayload) => send<Comment>("put", E.UPDATE(id), payload),
  setStatus: (id: number, status: CommentStatus) => send<Comment>("patch", E.STATUS(id), { status }),
  reply: (id: number, body: string) => send<Comment>("post", E.REPLY(id), { body }),
  remove: (id: number) => send<null>("delete", E.DELETE(id)),
  bulk: (ids: number[], action: CommentBulkAction) => send<null>("post", E.BULK, { ids, action }),
};
