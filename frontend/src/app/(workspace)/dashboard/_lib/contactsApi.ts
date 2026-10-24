import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery, type QueryParams } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

export type ContactSource = "inbox" | "manual" | "import" | "api";
export type BulkContactAction =
  "delete" | "add_tag" | "remove_tag" | "opt_out" | "opt_in" | "block" | "unblock";

export interface Contact {
  id: number;
  wa_id: string;
  phone: string;
  name: string | null;
  profile_name: string | null;
  display_name: string;
  email: string | null;
  tags: string[];
  attributes: Record<string, string>;
  source: ContactSource;
  opted_out: boolean;
  blocked: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  conversation: { id: number; status: string; unread_count: number } | null;
}

export interface ContactInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  tags: string[];
  attributes: Record<string, string>;
  opted_out: boolean;
  blocked: boolean;
}

export interface ContactStats {
  total: number;
  new_7d: number;
  prev_7d: number;
  active_30d: number;
  opted_out: number;
  blocked: number;
  tags: { tag: string; count: number }[];
}

export type SheetRowStatus = "new" | "update" | "exists" | "duplicate" | "invalid";

/** Which column holds what; columns in `skip` are left out, every other column becomes a custom field. */
export interface SheetMapping {
  phone: string | null;
  name: string | null;
  email: string | null;
  tags: string | null;
  skip: string[];
}

export interface SheetRow {
  row: number;
  phone: string;
  wa_id: string | null;
  name: string | null;
  email: string | null;
  tags: string[];
  fields: Record<string, string>;
  status: SheetRowStatus;
  message: string | null;
  duplicate_of: number | null;
  warnings: string[];
  contact_id: number | null;
}

export interface SheetCounts {
  total: number;
  new: number;
  update: number;
  exists: number;
  duplicate: number;
  invalid: number;
  warnings: number;
}

export interface SheetPreview {
  filename: string;
  sheet: string | null;
  headers: string[];
  mapping: SheetMapping;
  custom: { column: string; field: string | null }[];
  counts: SheetCounts;
  truncated: boolean;
  max_rows: number;
  rows: SheetRow[];
}

export interface SheetOptions {
  mapping?: SheetMapping | null;
  tag?: string;
  updateExisting: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  tag: string | null;
  counts: SheetCounts;
  errors: { row: number; message: string }[];
  columns: {
    phone: string;
    name: string | null;
    email: string | null;
    tags: string | null;
    custom: string[];
  };
}

export interface ContactPage {
  items: Contact[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

const C = CUSTOMER_ENDPOINTS.CONTACTS;
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

function sheetForm(file: File, options: SheetOptions) {
  const form = new FormData();
  form.append("file", file);
  if (options.mapping) form.append("mapping", JSON.stringify(options.mapping));
  if (options.tag) form.append("tag", options.tag);
  form.append("update_existing", String(options.updateExisting));
  return form;
}

export const contactsApi = {
  async page(params: QueryParams, signal?: AbortSignal): Promise<ContactPage> {
    const res = await fetch(`${BROWSER_API_BASE_URL}${withQuery(C.LIST, { page: 1, ...params })}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
    const body = await json<{ data: Contact[]; meta: ContactPage["meta"] }>(res);
    return { items: body.data, meta: body.meta };
  },
  stats: () => request<ContactStats>("GET", C.STATS),
  attributes: () => request<string[]>("GET", C.ATTRIBUTES),
  get: (id: number) => request<Contact>("GET", C.ONE(id)),
  create: (body: ContactInput) => request<Contact>("POST", C.LIST, body),
  update: (id: number, body: ContactInput) => request<Contact>("PUT", C.ONE(id), body),
  remove: (id: number) => request<null>("DELETE", C.ONE(id)),
  bulk: (ids: number[], action: BulkContactAction, tag?: string) =>
    request<null>("POST", C.BULK, { ids, action, tag }),
  /** Every row of the sheet and what importing it would do. Nothing is saved. */
  async previewSheet(file: File, options: SheetOptions, signal?: AbortSignal) {
    const res = await fetch(`${BROWSER_API_BASE_URL}${C.IMPORT_PREVIEW}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: sheetForm(file, options),
      signal,
    });
    return (await json<{ data: SheetPreview }>(res)).data;
  },
  async importSheet(file: File, options: SheetOptions) {
    const res = await fetch(`${BROWSER_API_BASE_URL}${C.IMPORT}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: sheetForm(file, options),
    });
    const body = await json<{ message?: string; data: ImportResult }>(res);
    return { message: body.message, data: body.data };
  },
  sampleUrl: (format: "xlsx" | "csv") => `${BROWSER_API_BASE_URL}${withQuery(C.IMPORT_SAMPLE, { format })}`,
  exportUrl: (params: QueryParams) => `${BROWSER_API_BASE_URL}${withQuery(C.EXPORT, params)}`,
};

export const CONTACTS_QK = {
  ALL: ["contacts"] as const,
  LIST: (params: QueryParams) => ["contacts", "list", params] as const,
  STATS: ["contacts", "stats"] as const,
  ATTRIBUTES: ["contacts", "attributes"] as const,
  ONE: (id: number) => ["contacts", "one", id] as const,
};
