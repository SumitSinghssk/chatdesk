import "server-only";

import type { Metadata } from "next";

import { absoluteUrl, siteConfig } from "@/config/site";
import { getSeo, getSettings } from "./websiteApi";

interface PageSeo {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noIndex?: boolean;
}

export async function buildMetadata(path: string, page: PageSeo = {}): Promise<Metadata> {
  const [seo, settings] = await Promise.all([getSeo(path), getSettings()]);
  const siteName = settings?.general.app_name || siteConfig.name;
  const exact = seo?.matched_path === path;

  const title = (exact && seo?.meta_title) || page.title || seo?.meta_title || siteName;
  const description =
    (exact && seo?.meta_description) ||
    page.description ||
    seo?.meta_description ||
    settings?.general.tagline ||
    undefined;
  const image = absoluteUrl(
    (exact && seo?.og_image) || page.image || seo?.og_image || settings?.general.logo_light
  );
  const canonical = (exact && seo?.canonical_url) || `${siteConfig.url}${path === "/" ? "" : path}`;
  const index = !page.noIndex && (seo?.allow_indexing ?? true);

  return {
    title: { absolute: title },
    description,
    keywords: seo?.meta_keywords
      ?.split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    alternates: { canonical },
    robots: { index, follow: index },
    icons: settings?.general.favicon ? { icon: settings.general.favicon } : undefined,
    openGraph: {
      type: page.type ?? "website",
      title,
      description,
      url: canonical,
      siteName,
      locale: "en_IN",
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
      ...(page.type === "article"
        ? { publishedTime: page.publishedTime ?? undefined, modifiedTime: page.modifiedTime ?? undefined }
        : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}
