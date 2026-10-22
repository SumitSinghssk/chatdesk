"use client";

import { useCallback, useSyncExternalStore } from "react";

// Same behaviour as the admin panel's shell prefs (favorites + open tabs per user),
// stored under a customer key so the two never mix.

export interface ShellTab {
  path: string;
  href: string;
}

export interface ShellPrefs {
  favorites: string[];
  tabs: ShellTab[];
}

const MAX_TABS = 12;
const EMPTY: ShellPrefs = { favorites: [], tabs: [] };

const cache = new Map<string, ShellPrefs>();
const listeners = new Set<() => void>();

function normalize(raw: unknown): ShellPrefs {
  if (!raw || typeof raw !== "object") return EMPTY;
  const r = raw as Partial<ShellPrefs>;
  return {
    favorites: Array.isArray(r.favorites) ? r.favorites.filter((f) => typeof f === "string") : [],
    tabs: Array.isArray(r.tabs)
      ? r.tabs.filter((t): t is ShellTab => !!t && typeof t.path === "string" && typeof t.href === "string")
      : [],
  };
}

function read(key: string): ShellPrefs {
  if (!cache.has(key)) {
    let value = EMPTY;
    try {
      value = normalize(JSON.parse(localStorage.getItem(key) ?? "null"));
    } catch {
      value = EMPTY;
    }
    cache.set(key, value);
  }
  return cache.get(key)!;
}

function write(key: string, next: ShellPrefs) {
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    return;
  } finally {
    listeners.forEach((fn) => fn());
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key && cache.has(e.key)) {
      cache.delete(e.key);
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useShellPrefs(customerId: number | string) {
  const key = `ck-shell:${customerId}`;
  const prefs = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY
  );

  const update = useCallback((fn: (p: ShellPrefs) => ShellPrefs) => write(key, fn(read(key))), [key]);
  const setTabs = useCallback(
    (fn: (tabs: ShellTab[]) => ShellTab[]) => update((p) => ({ ...p, tabs: fn(p.tabs) })),
    [update]
  );

  const toggleFavorite = useCallback(
    (path: string) =>
      update((p) => ({
        ...p,
        favorites: p.favorites.includes(path)
          ? p.favorites.filter((f) => f !== path)
          : [...p.favorites, path],
      })),
    [update]
  );

  const visit = useCallback(
    (path: string, href: string) =>
      setTabs((current) => {
        let next = current.some((t) => t.path === path)
          ? current.map((t) => (t.path === path ? { path, href } : t))
          : [...current, { path, href }];
        if (next.length > MAX_TABS) next = next.slice(next.length - MAX_TABS);
        return next;
      }),
    [setTabs]
  );

  const closeTab = useCallback(
    (path: string) => setTabs((tabs) => tabs.filter((t) => t.path !== path)),
    [setTabs]
  );
  const closeOtherTabs = useCallback(
    (path: string) => setTabs((tabs) => tabs.filter((t) => t.path === path)),
    [setTabs]
  );
  const closeAllTabs = useCallback(() => setTabs(() => []), [setTabs]);
  const reorderTabs = useCallback(
    (from: number, to: number) =>
      setTabs((tabs) => {
        const next = [...tabs];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      }),
    [setTabs]
  );

  return { prefs, toggleFavorite, visit, closeTab, closeOtherTabs, closeAllTabs, reorderTabs };
}

export type ShellPrefsApi = ReturnType<typeof useShellPrefs>;
