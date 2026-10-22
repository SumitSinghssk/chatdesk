import { createCrudApi, getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

export const DEFAULT_SEO_PATH = "*";

export interface SeoFaq {
  question: string;
  answer: string;
}

export interface SeoPage {
  id: number;
  page: string;
  path: string;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image: string | null;
  canonical_url: string | null;
  schema_markup: string | null;
  header_scripts: string | null;
  footer_scripts: string | null;
  custom_css: string | null;
  faqs: SeoFaq[];
  allow_indexing: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeoPagePayload {
  page: string;
  path: string;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  og_image?: string | null;
  canonical_url?: string | null;
  schema_markup?: string | null;
  header_scripts?: string | null;
  footer_scripts?: string | null;
  custom_css?: string | null;
  faqs: SeoFaq[];
  allow_indexing: boolean;
}

export interface SeoStats {
  total: number;
  indexable: number;
  noindex: number;
  missing_description: number;
  missing_title: number;
  with_faqs: number;
  has_default: boolean;
}

export const seoApi = {
  ...createCrudApi<SeoPage, SeoPagePayload>(ADMIN_ENDPOINTS.SEO),
  stats: () => getOne<SeoStats>(ADMIN_ENDPOINTS.SEO.STATS),
  bulkDelete: (ids: number[]) => send<null>("post", ADMIN_ENDPOINTS.SEO.BULK_DELETE, { ids }),
  findByPath: async (path: string) =>
    (await getPage<SeoPage>(ADMIN_ENDPOINTS.SEO.LIST, { path, per_page: 1 })).items[0] ?? null,
};
