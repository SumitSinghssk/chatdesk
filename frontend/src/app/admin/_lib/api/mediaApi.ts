import api from "./client";
import { getList, getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse, ListParams } from "./types";

export interface MediaFile {
  id: number;
  folder: string;
  filename: string;
  original_name: string | null;
  url: string;
  path: string;
  mime: string | null;
  extension: string | null;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  uploaded_by: { id: number; name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface MediaStats {
  total: number;
  total_size: number;
  image_size: number;
  images: number;
  documents: number;
  other: number;
  last_7_days: number;
  previous_7_days: number;
  missing_alt: number;
  folders: number;
}

const E = ADMIN_ENDPOINTS.MEDIA;

export const mediaApi = {
  page: (params: ListParams, signal?: AbortSignal) =>
    getPage<MediaFile>(E.LIST, { per_page: 48, ...params }, signal),
  folders: () => getList<{ folder: string; count: number }>(E.FOLDERS),
  stats: () => getOne<MediaStats>(E.STATS),
  async upload(file: File, folder = "general", alt?: string): Promise<MediaFile> {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    if (alt) form.append("alt", alt);
    const res = await api.post<ApiResponse<MediaFile>>(E.UPLOAD, form);
    return res.data.data;
  },
  async replace(id: number, file: File): Promise<MediaFile> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post<ApiResponse<MediaFile>>(E.REPLACE(id), form);
    return res.data.data;
  },
  update: (id: number, alt: string) => send<MediaFile>("put", E.UPDATE(id), { alt }),
  remove: (id: number) => send<null>("delete", E.DELETE(id)),
  bulkDelete: (ids: number[]) => send<null>("post", E.BULK_DELETE, { ids }),
};
