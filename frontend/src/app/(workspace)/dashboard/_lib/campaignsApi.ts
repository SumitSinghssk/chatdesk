import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery, type QueryParams } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

import type { Template } from "./templatesApi";

export type CampaignStatus =
  "draft" | "waiting" | "scheduled" | "sending" | "paused" | "completed" | "cancelled" | "failed";
export type Segment =
  | "sent"
  | "delivered"
  | "read"
  | "not_read"
  | "replied"
  | "not_replied"
  | "read_not_replied"
  | "clicked"
  | "not_clicked"
  | "failed";
export type RecipientStatus =
  "pending" | "sent" | "delivered" | "read" | "replied" | "clicked" | "failed" | "skipped";

export interface Audience {
  type: "all" | "tags" | "contacts" | "campaign";
  tags: string[];
  tag_match: "any" | "all";
  exclude_tags: string[];
  contact_ids: number[];
  campaign_id: number | null;
  segment: Segment | null;
}

export type VariableSourceKind = "name" | "first_name" | "phone" | "email" | "attribute" | "static";

export interface VariableSource {
  source: VariableSourceKind;
  value: string | null;
  fallback: string | null;
}

export interface CampaignVariables {
  header: Record<string, VariableSource>;
  body: Record<string, VariableSource>;
  buttons: Record<string, VariableSource>;
}

export interface Location {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface CampaignReport {
  recipients: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  clicked: number;
}

export interface Campaign {
  id: number;
  name: string;
  template_id: number | null;
  template_name: string;
  template_language: string;
  template_category: string | null;
  audience: Audience;
  variables: CampaignVariables;
  header_media: string | null;
  location: Location | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  total: number;
  skipped: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** a follow-up: sent this many hours after campaign `follow_up_of` finished */
  follow_up_of: number | null;
  follow_up_hours: number | null;
  report: CampaignReport;
  template?: Template;
  /** the campaign this one follows up on (detail only) */
  follows?: CampaignBrief | null;
  /** follow-ups waiting for, or sent after, this campaign (detail only) */
  follow_ups?: (CampaignBrief & { report: CampaignReport })[];
}

export interface CampaignBrief {
  id: number;
  name: string;
  status: CampaignStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  follow_up_hours: number | null;
  segment: Segment | null;
}

export interface CampaignInput {
  name: string;
  template_id: number;
  audience: Audience;
  variables: CampaignVariables;
  header_media: string | null;
  location: Location | null;
  action: "draft" | "now" | "schedule" | "follow_up";
  scheduled_at: string | null;
  follow_up_hours: number | null;
}

export interface AudiencePreview {
  matched: number;
  eligible: number;
  opted_out: number;
  blocked: number;
  missing_values: number;
  cost: number;
  currency: string;
  category: string;
  daily_limit: number | null;
  over_limit: boolean;
  samples: {
    contact: { id: number; name: string | null; phone: string };
    header: string[];
    body: string[];
    buttons: Record<string, string>;
    missing: string[];
  }[];
}

export interface CampaignStats {
  total: number;
  scheduled: number;
  active: number;
  completed: number;
  draft: number;
  sent_today: number;
  all_recipients: number;
  all_sent: number;
  all_delivered: number;
  all_read: number;
  all_replied: number;
  all_failed: number;
  all_clicked: number;
}

export interface Recipient {
  id: number;
  contact: { id: number; name: string | null; phone: string };
  status: RecipientStatus;
  replied: boolean;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  conversation_id: number | null;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

const C = CUSTOMER_ENDPOINTS.CAMPAIGNS;
const headers = { Accept: "application/json", "X-Requested-With": "sk-web" };

async function page<T>(path: string, signal?: AbortSignal): Promise<{ items: T[]; meta: PageMeta }> {
  const res = await fetch(`${BROWSER_API_BASE_URL}${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new CustomerApiError(body.message ?? "Something went wrong.", res.status);
  return { items: body.data, meta: body.meta };
}

export const campaignsApi = {
  page: (params: QueryParams, signal?: AbortSignal) =>
    page<Campaign>(withQuery(C.LIST, { page: 1, ...params }), signal),
  stats: () => request<CampaignStats>("GET", C.STATS),
  get: (id: number) => request<Campaign>("GET", C.ONE(id)),
  create: (body: CampaignInput) => request<Campaign>("POST", C.LIST, body),
  update: (id: number, body: CampaignInput) => request<Campaign>("PUT", C.ONE(id), body),
  remove: (id: number) => request<null>("DELETE", C.ONE(id)),
  control: (id: number, action: "pause" | "resume" | "cancel") =>
    request<Campaign>("POST", C.CONTROL(id, action)),
  preview: (body: { template_id: number; audience: Audience; variables: CampaignVariables }) =>
    request<AudiencePreview>("POST", C.PREVIEW, body),
  test: (body: {
    template_id: number;
    variables: CampaignVariables;
    header_media: string | null;
    location: Location | null;
    phone: string;
  }) => request<unknown>("POST", C.TEST, body),
  segments: (id: number) => request<Record<Segment, number>>("GET", C.SEGMENTS(id)),
  recipients: (id: number, params: QueryParams, signal?: AbortSignal) =>
    page<Recipient>(withQuery(C.RECIPIENTS(id), { page: 1, ...params }), signal),
  exportUrl: (id: number, status?: string) => `${BROWSER_API_BASE_URL}${withQuery(C.EXPORT(id), { status })}`,
};

export const CAMPAIGNS_QK = {
  ALL: ["campaigns"] as const,
  LIST: (params: QueryParams) => ["campaigns", "list", params] as const,
  STATS: ["campaigns", "stats"] as const,
  ONE: (id: number) => ["campaigns", "one", id] as const,
  SEGMENTS: (id: number) => ["campaigns", "segments", id] as const,
  RECIPIENTS: (id: number, params: QueryParams) => ["campaigns", "recipients", id, params] as const,
};
