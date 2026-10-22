import { createCrudApi, getOne } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { IdName, PublishStatus } from "./types";

export interface Blog {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content?: string | null;
  featured_image: string | null;
  status: PublishStatus;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  author: IdName | null;
  categories: { id: number; name: string; slug: string }[];
  category_ids: number[];
  comments_enabled: boolean;
  comments_count?: number;
  pending_comments?: number;
  created_at: string;
  updated_at: string;
}

export interface BlogPayload {
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  content?: string | null;
  featured_image?: string | null;
  status: PublishStatus;
  published_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  category_ids: number[];
  comments_enabled?: boolean;
}

export interface PublishStats {
  total: number;
  published: number;
  draft: number;
  scheduled: number;
  without_image: number;
}

export interface BlogStats extends PublishStats {
  last_30_days: number;
  previous_30_days: number;
  uncategorized: number;
  pending_comments: number;
}

export const blogsApi = {
  ...createCrudApi<Blog, BlogPayload>(ADMIN_ENDPOINTS.BLOGS),
  stats: () => getOne<BlogStats>(ADMIN_ENDPOINTS.BLOGS.STATS),
};
