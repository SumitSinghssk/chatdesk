import { getList, getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { IdName, ListParams } from "./types";

export const ENQUIRY_STATUSES = ["new", "in_progress", "replied", "on_hold", "closed", "spam"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_SOURCES = [
  "website",
  "phone-call",
  "walk-in",
  "email",
  "whatsapp",
  "social-media",
  "referral",
  "event",
  "other",
] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const NOTE_REQUIRED_STATUSES: readonly EnquiryStatus[] = ["on_hold", "closed"];

export type EnquiryBulkAction = "delete" | `mark-${EnquiryStatus}`;
export type EnquiryActivityType =
  "created" | "note" | "status" | "reply" | "assigned" | "follow_up" | "edited";

export interface Enquiry {
  id: number;
  reference: string;
  source: string;
  source_url: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  subject: string | null;
  message_preview: string;
  status: EnquiryStatus;
  assigned_to: number | null;
  assignee: IdName | null;
  follow_up_at: string | null;
  seen_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface EnquiryActivity {
  id: number;
  type: EnquiryActivityType;
  body: string | null;
  meta: Record<string, unknown> | null;
  user: IdName | null;
  created_at: string;
}

export interface EnquiryDetail extends Enquiry {
  message: string;
  creator: IdName | null;
  activities: EnquiryActivity[];
}

export interface EnquiryStats {
  open: number;
  new: number;
  unseen: number;
  follow_up_due: number;
  mine: number;
  unassigned: number;
  today: number;
  this_week: number;
  last_week: number;
  total: number;
  by_status: Record<EnquiryStatus, number>;
}

export interface EnquiryContactPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  subject?: string | null;
  message: string;
  source?: EnquirySource | null;
}

export interface EnquiryCreatePayload extends EnquiryContactPayload {
  status: "new" | "in_progress";
  assigned_to?: number | null;
  follow_up_at?: string | null;
  note?: string | null;
}

export interface EnquiryReplyPayload {
  subject: string;
  body: string;
  include_original: boolean;
}

const E = ADMIN_ENDPOINTS.ENQUIRIES;

export const enquiriesApi = {
  page: (params: ListParams, signal?: AbortSignal) => getPage<Enquiry>(E.LIST, params, signal),
  get: (id: number) => getOne<EnquiryDetail>(E.SHOW(id)),
  stats: () => getOne<EnquiryStats>(E.STATS),
  sources: () => getList<string>(E.SOURCES),
  assignees: () => getList<IdName>(E.ASSIGNEES),
  create: (payload: EnquiryCreatePayload) => send<EnquiryDetail>("post", E.CREATE, payload),
  update: (id: number, payload: EnquiryContactPayload) => send<EnquiryDetail>("put", E.UPDATE(id), payload),
  remove: (id: number) => send<null>("delete", E.DELETE(id)),
  bulk: (ids: number[], action: EnquiryBulkAction) => send<null>("post", E.BULK, { ids, action }),
  changeStatus: (id: number, status: EnquiryStatus, note?: string | null) =>
    send<EnquiryDetail>("post", E.STATUS(id), { status, note: note || null }),
  addNote: (id: number, body: string) => send<EnquiryActivity>("post", E.NOTES(id), { body }),
  deleteNote: (id: number, activityId: number) => send<null>("delete", E.NOTE(id, activityId)),
  assign: (id: number, userId: number | null) =>
    send<EnquiryDetail>("post", E.ASSIGN(id), { user_id: userId }),
  followUp: (id: number, followUpAt: string | null) =>
    send<EnquiryDetail>("post", E.FOLLOW_UP(id), { follow_up_at: followUpAt }),
  reply: (id: number, payload: EnquiryReplyPayload) => send<EnquiryDetail>("post", E.REPLY(id), payload),
};
