export interface RedirectRule {
  source_path: string;
  target_url: string;
  status_code: number;
}

interface ProxyCacheStore {
  rules: { at: number; redirects: Map<string, RedirectRule>; maintenance: boolean } | null;
  firewall: { at: number; rules: string[] } | null;
}

const holder = globalThis as typeof globalThis & { __skProxyCache?: ProxyCacheStore };

export const proxyCache: ProxyCacheStore = (holder.__skProxyCache ??= { rules: null, firewall: null });

export function clearProxyCache(tags: readonly string[]) {
  const all = tags.length === 0;
  if (all || tags.includes("redirects") || tags.includes("settings")) proxyCache.rules = null;
  if (all || tags.includes("firewall")) proxyCache.firewall = null;
}
