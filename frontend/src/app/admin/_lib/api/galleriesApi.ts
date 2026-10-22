import api from "./client";
import { createCrudApi, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse, Status } from "./types";

export interface GalleryItem {
  id: number;
  type: "image" | "youtube";
  path: string | null;
  youtube_id: string | null;
  title: string | null;
  caption: string | null;
  sort_order: number;
  thumbnail: string | null;
}

export interface Gallery {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  cover_image: string | null;
  is_featured: boolean;
  sort_order: number;
  status: Status;
  items_count: number;
  image_count: number;
  youtube_count: number;
  created_at: string;
  updated_at: string;
}

export interface GalleryDetail extends Gallery {
  stored_cover_image: string | null;
  items: GalleryItem[];
}

export interface GalleryPayload {
  title: string;
  slug?: string | null;
  description?: string | null;
  event_date?: string | null;
  cover_image?: string | null;
  is_featured: boolean;
  sort_order: number;
  status: Status;
}

export interface GalleryStats {
  total: number;
  active: number;
  inactive: number;
  featured: number;
  empty: number;
  without_cover: number;
  images: number;
  videos: number;
  items_last_7_days: number;
}

const E = ADMIN_ENDPOINTS.GALLERIES;
const crud = createCrudApi<Gallery, GalleryPayload>(E);

export const galleriesApi = {
  ...crud,
  stats: () => getOne<GalleryStats>(E.STATS),
  get: (id: number) => crud.get(id) as Promise<GalleryDetail>,
  async upload(id: number, files: File[], onProgress?: (percent: number) => void) {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const res = await api.post<ApiResponse<GalleryDetail>>(E.UPLOAD(id), form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
    return res.data;
  },
  addYoutube: (id: number, body: { url: string; title?: string | null; caption?: string | null }) =>
    send<GalleryDetail>("post", E.YOUTUBE(id), body),
  updateItem: (id: number, itemId: number, body: { title: string | null; caption: string | null }) =>
    send<GalleryItem>("put", E.ITEM(id, itemId), body),
  removeItem: (id: number, itemId: number) => send<GalleryDetail>("delete", E.ITEM(id, itemId)),
  reorderItems: (id: number, ids: number[]) => send<GalleryDetail>("post", E.REORDER(id), { ids }),
  bulkDeleteItems: (id: number, ids: number[]) => send<GalleryDetail>("post", E.BULK_DELETE(id), { ids }),
  setCover: (id: number, itemId: number) => send<GalleryDetail>("post", E.COVER(id), { item_id: itemId }),
};
