import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { getSitemap } from "./(website)/_lib/websiteApi";

import { WEBSITE_ROUTES } from "@/config/routes";
export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemap();
  return entries.map(({ path, lastmod }) => ({
    url: `${siteConfig.url}${path === "/" ? "" : path}`,
    lastModified: lastmod ? new Date(lastmod) : undefined,
    changeFrequency: path === "/" || path === WEBSITE_ROUTES.BLOG() ? "daily" : "weekly",
    priority: path === "/" ? 1 : path.split("/").length > 2 ? 0.6 : 0.8,
  }));
}
