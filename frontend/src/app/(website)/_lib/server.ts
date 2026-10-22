import "server-only";

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { CACHE_TTL, tagsForPath } from "@/config/cache";
import { API_BASE_URL } from "@/config/site";

export const REVALIDATE = CACHE_TTL;

type ApiResult<T> = {
  data: T;
  meta?: { page: number; per_page: number; total: number; total_pages: number };
};
type GetOptions = { params?: Record<string, string | number | undefined>; revalidate?: number | false };

export async function apiGet<T>(
  path: string,
  { params, revalidate = REVALIDATE }: GetOptions = {}
): Promise<ApiResult<T> | null> {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      ...(revalidate === false
        ? { cache: "no-store" as const }
        : { next: { revalidate, tags: tagsForPath(path) } }),
    });
  } catch (error) {
    if (process.env.NEXT_PHASE === "phase-production-build") await connection();
    throw error;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Website API ${path} failed with HTTP ${res.status}`);
  const json = await res.json();
  return { data: json.data as T, meta: json.meta };
}

export async function apiGetSafe<T>(path: string, options?: GetOptions): Promise<ApiResult<T> | null> {
  try {
    return await apiGet<T>(path, options);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}
