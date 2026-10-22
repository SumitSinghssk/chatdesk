import { route, withQuery, type QueryParams } from "./query";

export const WEBSITE_ROUTES = {
  HOME: route("/"),
  BLOG: route("/blog"),
  BLOG_POST: (slug: string) => `/blog/${encodeURIComponent(slug)}`,
  GALLERY: route("/gallery"),
  GALLERY_ITEM: (slug: string) => `/gallery/${encodeURIComponent(slug)}`,
  CONTACT: route("/contact"),
  TEAM: route("/team"),
  PAGE: (slug: string, params?: QueryParams) => withQuery(`/${encodeURIComponent(slug)}`, params),
  MAINTENANCE: route("/maintenance"),
} as const;
