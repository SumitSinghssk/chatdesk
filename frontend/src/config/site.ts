export const siteConfig = {
  name: "ChatDesk",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001").replace(/\/$/, ""),
} as const;

export const API_BASE_URL = `${siteConfig.apiUrl}/api/v1`;

export const BROWSER_API_BASE_URL = (process.env.NEXT_PUBLIC_ADMIN_API_BASE || "/api/v1").replace(/\/$/, "");

export function absoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${siteConfig.url}${path.startsWith("/") ? "" : "/"}${path}`;
}
