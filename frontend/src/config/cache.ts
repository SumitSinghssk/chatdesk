export const CACHE_TTL = 600;

export const CACHE_TAGS = [
  "settings",
  "menus",
  "seo",
  "blogs",
  "comments",
  "pages",
  "galleries",
  "testimonials",
  "team",
  "sitemap",
  "redirects",
  "firewall",
] as const;

export type CacheTag = (typeof CACHE_TAGS)[number];

const PATH_TAGS: [RegExp, CacheTag[]][] = [
  [/^\/website\/blogs\/[^/]+\/comments/, ["comments", "settings"]],
  [/^\/website\/blogs/, ["blogs"]],
  [/^\/website\/blog-categories/, ["blogs"]],
  [/^\/website\/settings/, ["settings"]],
  [/^\/website\/menus/, ["menus"]],
  [/^\/website\/seo/, ["seo"]],
  [/^\/website\/pages/, ["pages"]],
  [/^\/website\/galleries/, ["galleries"]],
  [/^\/website\/testimonials/, ["testimonials"]],
  [/^\/website\/team/, ["team"]],
  [/^\/website\/sitemap/, ["sitemap", "blogs", "pages", "galleries"]],
];

export function tagsForPath(path: string): string[] {
  const match = PATH_TAGS.find(([pattern]) => pattern.test(path));
  return ["website", ...(match?.[1] ?? [])];
}

export function isCacheTag(value: unknown): value is CacheTag {
  return typeof value === "string" && (CACHE_TAGS as readonly string[]).includes(value);
}
