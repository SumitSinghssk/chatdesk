import "server-only";

import { cache } from "react";

import { WEBSITE_ENDPOINTS } from "@/config/endpoints/website";
import { setDisplayTimeZone } from "@/lib/utils";

import { apiGet, apiGetSafe } from "./server";

const W = WEBSITE_ENDPOINTS;

export interface SiteSettings {
  general: {
    app_name: string;
    tagline: string;
    logo_light: string | null;
    logo_dark: string | null;
    favicon: string | null;
    addresses: { label: string; text: string; map_iframe?: string | null }[];
    phones: string[];
    emails: string[];
    social_links: { platform: string; url: string }[];
    footer_text: string;
  };
  scripts: { header_scripts: string; footer_scripts: string; custom_css: string };
  maintenance: { enabled: boolean; title: string; message: string; ends_at: string | null };
  date_time: { timezone: string; date_format: string; time_format: string };
}

export interface SeoData {
  page: string;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image: string | null;
  canonical_url: string | null;
  schema_markup: string | null;
  header_scripts: string | null;
  footer_scripts: string | null;
  custom_css: string | null;
  faqs: { question: string; answer: string }[];
  allow_indexing: boolean;
  matched_path: string;
}

export interface MenuNode {
  id: number;
  label: string;
  url: string;
  new_tab: boolean;
  children: MenuNode[];
}

export interface BlogCard {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  updated_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  author: { name: string } | null;
  categories: { id: number; name: string; slug: string }[];
}

export interface BlogPost extends BlogCard {
  content: string | null;
  comments_enabled: boolean;
  related: BlogCard[];
}

export interface BlogCommentNode {
  id: number;
  author_name: string;
  body: string;
  is_admin: boolean;
  depth: number;
  created_at: string;
  replies: BlogCommentNode[];
}

export interface BlogComments {
  enabled: boolean;
  open: boolean;
  allow_replies: boolean;
  max_depth: number;
  count: number;
  items: BlogCommentNode[];
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  posts_count: number;
}

export interface CmsPage {
  id: number;
  title: string;
  slug: string;
  content: string | null;
  featured_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  updated_at: string | null;
}

export interface TeamMember {
  id: number;
  name: string;
  designation: string | null;
  department: string | null;
  bio: string | null;
  photo: string | null;
  email: string | null;
  phone: string | null;
  social_links: { platform: string; url: string }[];
  is_featured: boolean;
}

export interface Testimonial {
  id: number;
  name: string;
  designation: string | null;
  company: string | null;
  quote: string;
  photo: string | null;
  rating: number | null;
  is_featured: boolean;
}

export interface GalleryCard {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  cover_image: string | null;
  items_count: number;
}

export interface GalleryDetail extends GalleryCard {
  items: {
    id: number;
    type: "image" | "youtube";
    path: string | null;
    youtube_id: string | null;
    title: string | null;
    caption: string | null;
    thumbnail: string | null;
  }[];
}

export const getSettings = cache(async () => {
  const settings = (await apiGetSafe<SiteSettings>(W.SETTINGS))?.data ?? null;
  setDisplayTimeZone(settings?.date_time?.timezone);
  return settings;
});

async function withSiteTime<T>(load: Promise<T>): Promise<T> {
  const [value] = await Promise.all([load, getSettings()]);
  return value;
}
export const getSeo = cache(
  async (path: string) =>
    (await apiGetSafe<SeoData | null>(W.SEO_BY_PATH, { params: { path } }))?.data ?? null
);
export const getMenu = cache(
  async (key: string) => (await apiGetSafe<{ items: MenuNode[] }>(W.MENU(key)))?.data.items ?? []
);

export const getBlogs = (params: { page?: number; per_page?: number; category?: string; search?: string }) =>
  withSiteTime(apiGet<BlogCard[]>(W.BLOGS, { params }));
export const getBlog = cache(
  async (slug: string) => (await withSiteTime(apiGet<BlogPost>(W.BLOG(slug))))?.data ?? null
);
export const getBlogComments = async (slug: string) =>
  (await apiGetSafe<BlogComments>(W.BLOG_COMMENTS(slug)))?.data ?? null;
export const getBlogCategories = async () => (await apiGet<BlogCategory[]>(W.BLOG_CATEGORIES))?.data ?? [];
export const getPage = cache(
  async (slug: string) => (await withSiteTime(apiGet<CmsPage>(W.PAGE(slug))))?.data ?? null
);
export const getTeam = async (params: { featured?: boolean } = {}) =>
  (await apiGetSafe<TeamMember[]>(W.TEAM, { params: params.featured ? { featured: "true" } : undefined }))
    ?.data ?? [];
export const getTestimonials = async () => (await apiGet<Testimonial[]>(W.TESTIMONIALS))?.data ?? [];
export const getGalleries = async () => (await apiGet<GalleryCard[]>(W.GALLERIES))?.data ?? [];
export const getGallery = cache(
  async (slug: string) => (await apiGet<GalleryDetail>(W.GALLERY(slug)))?.data ?? null
);
export const getSitemap = async () =>
  (await apiGet<{ path: string; lastmod: string | null }[]>(W.SITEMAP))?.data ?? [];
export const getRobots = async () => (await apiGetSafe<{ content: string }>(W.ROBOTS))?.data.content ?? null;
