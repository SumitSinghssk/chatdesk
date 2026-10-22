import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery, type QueryParams } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

export type TemplateCategory = "marketing" | "utility" | "authentication";
export type HeaderFormat = "none" | "text" | "image" | "video" | "document" | "location";
export type ButtonType = "quick_reply" | "url" | "phone_number" | "copy_code" | "otp" | "other";
export type ParameterFormat = "positional" | "named";
export type TemplateStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "in_appeal"
  | "pending_deletion"
  | "archived"
  | "limit_exceeded";

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url: string | null;
  phone_number: string | null;
  /** url: sample for the {{1}} at the end of a dynamic link · copy_code: the sample code */
  example: string | null;
}

/** The editor's shape of a template (the API converts it to and from Meta's components). */
export interface TemplateForm {
  header: { format: HeaderFormat; text: string | null; example: string | null };
  body: string;
  examples: Record<string, string>;
  footer: string | null;
  buttons: TemplateButton[];
  add_security_recommendation: boolean;
  code_expiration_minutes: number | null;
  media_url?: string | null;
  supported?: boolean;
}

export interface TemplateSendParams {
  header: string[];
  body: string[];
  buttons: { index: number; type: "url" | "copy_code"; label: string; example: string | null }[];
}

export interface TemplateStatsCounts {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  last_sent_at: string | null;
}

export interface Template {
  id: number;
  meta_id: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  parameter_format: ParameterFormat;
  status: TemplateStatus;
  rejected_reason: string | null;
  quality: string | null;
  source: "app" | "meta";
  form: TemplateForm;
  params: TemplateSendParams;
  editable: boolean;
  sample: { path: string; mime: string | null; filename: string | null; size: number | null } | null;
  stats: TemplateStatsCounts;
  submitted_at: string | null;
  status_changed_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateInput extends Omit<TemplateForm, "media_url" | "supported"> {
  name: string;
  language: string;
  category: TemplateCategory;
  parameter_format: ParameterFormat;
  sample_key?: string | null;
  sample_filename?: string | null;
  submit: boolean;
}

export interface TemplateStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  paused: number;
  draft: number;
  languages: string[];
  connected: boolean;
  synced_at: string | null;
}

export interface SyncResult {
  synced?: boolean;
  error?: string | null;
  total?: number;
  added?: number;
  removed?: number;
  changes: { id: number; name: string; status: TemplateStatus }[];
}

export interface UploadedSample {
  key: string;
  mime: string;
  filename: string;
  size: number;
  path: string;
}

export interface TemplatePage {
  items: Template[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

const T = CUSTOMER_ENDPOINTS.TEMPLATES;
const headers = { Accept: "application/json", "X-Requested-With": "sk-web" };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Object.fromEntries(
      Object.entries((body.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0] ?? ""])
    );
    throw new CustomerApiError(body.message ?? "Something went wrong.", res.status, errors);
  }
  return body as T;
}

export const apiUrl = (path: string) => `${BROWSER_API_BASE_URL}${path}`;

export const templatesApi = {
  async page(params: QueryParams, signal?: AbortSignal): Promise<TemplatePage> {
    const res = await fetch(apiUrl(withQuery(T.LIST, { page: 1, ...params })), {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
    const body = await json<{ data: Template[]; meta: TemplatePage["meta"] }>(res);
    return { items: body.data, meta: body.meta };
  },
  stats: () => request<TemplateStats>("GET", T.STATS),
  get: (id: number) => request<Template>("GET", T.ONE(id)),
  create: (body: TemplateInput) => request<Template>("POST", T.LIST, body),
  update: (id: number, body: TemplateInput) => request<Template>("PUT", T.ONE(id), body),
  remove: (id: number) => request<null>("DELETE", T.ONE(id)),
  sampleUrl: (path: string) => apiUrl(path),
  sync: (auto = false) => request<SyncResult>("POST", withQuery(T.SYNC, { auto: auto || undefined })),
  async uploadSample(file: File, kind: "image" | "video" | "document") {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch(apiUrl(T.MEDIA), {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: form,
    });
    const body = await json<{ data: UploadedSample }>(res).catch((err: CustomerApiError) => {
      throw new CustomerApiError(err.errors?.file ?? err.message, err.status, err.errors);
    });
    return body.data;
  },
};

export const TEMPLATES_QK = {
  ALL: ["templates"] as const,
  LIST: (params: QueryParams) => ["templates", "list", params] as const,
  STATS: ["templates", "stats"] as const,
  ONE: (id: number) => ["templates", "one", id] as const,
};
