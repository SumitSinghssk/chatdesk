import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { getRobots } from "./(website)/_lib/websiteApi";

import { ADMIN_ROUTES } from "@/config/routes";
export const revalidate = 600;

type Rule = { userAgent: string[]; allow: string[]; disallow: string[]; crawlDelay?: number };

function parseRobots(content: string) {
  const groups: Rule[] = [];
  const sitemaps: string[] = [];
  let host: string | undefined;
  let current: Rule | null = null;
  let lastWasAgent = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!value) continue;
      if (current && lastWasAgent) current.userAgent.push(value);
      else groups.push((current = { userAgent: [value], allow: [], disallow: [] }));
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "host") {
      if (value) host = value;
      continue;
    }
    if (key !== "allow" && key !== "disallow" && key !== "crawl-delay") continue;
    if (!current) groups.push((current = { userAgent: ["*"], allow: [], disallow: [] }));
    if (key === "allow" && value) current.allow.push(value);
    if (key === "disallow" && value) current.disallow.push(value);
    if (key === "crawl-delay") {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay >= 0) current.crawlDelay = delay;
    }
  }
  return { groups, sitemaps, host };
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const content = (await getRobots()) ?? "User-agent: *\nAllow: /";
  const { groups, sitemaps, host } = parseRobots(content);
  if (!groups.length) groups.push({ userAgent: ["*"], allow: ["/"], disallow: [] });

  const rules = groups.map(({ userAgent, allow, disallow, crawlDelay }) => ({
    userAgent: userAgent.length === 1 ? userAgent[0]! : userAgent,
    ...(allow.length ? { allow } : {}),
    disallow: [...new Set([ADMIN_ROUTES.ROOT(), ...disallow])],
    ...(crawlDelay !== undefined ? { crawlDelay } : {}),
  }));

  const sitemap = `${siteConfig.url}/sitemap.xml`;
  return {
    rules,
    sitemap: [sitemap, ...sitemaps.filter((url) => url !== sitemap)],
    host: host ?? siteConfig.url,
  };
}
