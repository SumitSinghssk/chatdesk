import { createCrudApi, getOne } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { IdName, Status } from "./types";

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  parent: IdName | null;
  description: string | null;
  image: string | null;
  status: Status;
  blog_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface BlogCategoryPayload {
  name: string;
  slug?: string | null;
  parent_id?: number | null;
  description?: string | null;
  image?: string | null;
  status: Status;
}

export interface BlogCategoryStats {
  total: number;
  active: number;
  inactive: number;
  top_level: number;
  subcategories: number;
  empty: number;
  this_week: number;
  last_week: number;
}

const E = ADMIN_ENDPOINTS.BLOG_CATEGORIES;

export const blogCategoriesApi = {
  ...createCrudApi<BlogCategory, BlogCategoryPayload>(E),
  stats: () => getOne<BlogCategoryStats>(E.STATS),
};
