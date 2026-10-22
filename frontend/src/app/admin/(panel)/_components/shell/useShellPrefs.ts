"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useAuthStore } from "@/app/admin/_store/authStore";
import type { WorkspaceKey } from "@/config/navigation";

export interface ShellTab {
  path: string;
  href: string;
}

export interface ShellPrefs {
  favorites: string[];
  tabs: Partial<Record<WorkspaceKey, ShellTab[]>>;
}

const MAX_TABS = 12;
const EMPTY: ShellPrefs = { favorites: [], tabs: {} };

const cache = new Map<string, ShellPrefs>();
const listeners = new Set<() => void>();

function normalize(raw: unknown): ShellPrefs {
  if (!raw || typeof raw !== "object") return EMPTY;
  const r = raw as Partial<ShellPrefs> & { tabs?: unknown };
  return {
    favorites: Array.isArray(r.favorites) ? r.favorites.filter((f) => typeof f === "string") : [],
    tabs:
      r.tabs && !Array.isArray(r.tabs) && typeof r.tabs === "object" ? (r.tabs as ShellPrefs["tabs"]) : {},
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

export function useShellPrefs() {
  const userId = useAuthStore((s) => s.user?.id ?? "guest");
  const key = `sk-shell:${userId}`;
  const prefs = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY
  );

  const update = useCallback((fn: (p: ShellPrefs) => ShellPrefs) => write(key, fn(read(key))), [key]);

  const setTabs = useCallback(
    (ws: WorkspaceKey, fn: (tabs: ShellTab[]) => ShellTab[]) =>
      update((p) => ({ ...p, tabs: { ...p.tabs, [ws]: fn(p.tabs[ws] ?? []) } })),
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
    (ws: WorkspaceKey, path: string, href: string) =>
      update((p) => {
        const current = p.tabs[ws] ?? [];
        let next = current.some((t) => t.path === path)
          ? current.map((t) => (t.path === path ? { path, href } : t))
          : [...current, { path, href }];
        if (next.length > MAX_TABS) next = next.slice(next.length - MAX_TABS);
        return { ...p, tabs: { ...p.tabs, [ws]: next } };
      }),
    [update]
  );

  const closeTab = useCallback(
    (ws: WorkspaceKey, path: string) => setTabs(ws, (tabs) => tabs.filter((t) => t.path !== path)),
    [setTabs]
  );

  const closeOtherTabs = useCallback(
    (ws: WorkspaceKey, path: string) => setTabs(ws, (tabs) => tabs.filter((t) => t.path === path)),
    [setTabs]
  );

  const closeAllTabs = useCallback((ws: WorkspaceKey) => setTabs(ws, () => []), [setTabs]);

  const reorderTabs = useCallback(
    (ws: WorkspaceKey, from: number, to: number) =>
      setTabs(ws, (tabs) => {
        const next = [...tabs];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      }),
    [setTabs]
  );

  return { prefs, toggleFavorite, visit, closeTab, closeOtherTabs, closeAllTabs, reorderTabs };
}
