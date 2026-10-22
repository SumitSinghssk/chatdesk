export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export function withQuery(path: string, params?: QueryParams) {
  if (!params) return path;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

export type PageRoute = ((params?: QueryParams) => string) & { path: string };

export function route(path: string): PageRoute {
  return Object.assign((params?: QueryParams) => withQuery(path, params), { path });
}
