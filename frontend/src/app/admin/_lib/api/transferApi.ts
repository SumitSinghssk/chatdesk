import axios from "axios";

import api from "./client";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse } from "./types";

const E = ADMIN_ENDPOINTS.TRANSFER;

export type TransferType =
  | "blogs"
  | "blog_categories"
  | "pages"
  | "testimonials"
  | "redirects"
  | "seo"
  | "users"
  | "enquiries"
  | "not_found";

export type ImportMode = "create" | "create_update";
export type PreviewStatus = "new" | "exists" | "duplicate" | "invalid";

export interface PreviewRow {
  line: number;
  label: string;
  status: PreviewStatus | "failed";
  messages: string[];
  warnings: string[];
}

export interface ImportPreview {
  token: string;
  filename: string;
  total: number;
  counts: Record<PreviewStatus, number>;
  columns: string[];
  unknown_columns: string[];
  can_update: boolean;
  rows: PreviewRow[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
  errors: PreviewRow[];
}

function saveBlob(blob: Blob, disposition: string | undefined, fallback: string) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "");
  const filename = match ? decodeURIComponent(match[1]!) : fallback;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function download(url: string, fallback: string) {
  try {
    const res = await api.get<Blob>(url, { responseType: "blob" });
    saveBlob(res.data, res.headers["content-disposition"] as string | undefined, fallback);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text());
      } catch {}
    }
    throw err;
  }
}

export const transferApi = {
  exportCsv: (type: TransferType) => download(E.EXPORT(type), `${type}.csv`),
  template: (type: TransferType) => download(E.TEMPLATE(type), `${type}-import-template.csv`),
  preview: async (type: TransferType, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post<ApiResponse<ImportPreview>>(E.PREVIEW(type), form);
    return res.data.data;
  },
  import: async (type: TransferType, token: string, mode: ImportMode) => {
    const form = new FormData();
    form.append("token", token);
    form.append("mode", mode);
    const res = await api.post<ApiResponse<ImportResult>>(E.IMPORT(type), form);
    return res.data;
  },
};
