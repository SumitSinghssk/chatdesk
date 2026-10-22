import "server-only";

import { CACHE_TTL, tagsForPath } from "@/config/cache";
import { WEBSITE_ENDPOINTS } from "@/config/endpoints/website";
import { API_BASE_URL, siteConfig } from "@/config/site";

export async function getSiteName(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}${WEBSITE_ENDPOINTS.SETTINGS}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: CACHE_TTL, tags: tagsForPath(WEBSITE_ENDPOINTS.SETTINGS) },
    });
    if (!res.ok) return siteConfig.name;
    const json = await res.json();
    return json?.data?.general?.app_name || siteConfig.name;
  } catch {
    return siteConfig.name;
  }
}
