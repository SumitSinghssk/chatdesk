import { createCrudApi, getOne } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { IdName, PublishStatus } from "./types";
import type { PublishStats } from "./blogsApi";

export interface Page {
  id: number;
  title: string;
  slug: string;
  content?: string | null;
  featured_image: string | null;
  status: PublishStatus;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  author: IdName | null;
  created_at: string;
  updated_at: string;
}

export interface PagePayload {
  title: string;
  slug?: string | null;
  content?: string | null;
  featured_image?: string | null;
  status: PublishStatus;
  published_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface PageStats extends PublishStats {
  updated_30_days: number;
}

export const pagesApi = {
  ...createCrudApi<Page, PagePayload>(ADMIN_ENDPOINTS.PAGES),
  stats: () => getOne<PageStats>(ADMIN_ENDPOINTS.PAGES.STATS),
};
