"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OPERATORS, toApiFilters } from "./operators";
import type { Density, FilterOp, FilterRule, FilterValue, GridView, SortRule } from "./types";

type CompactRule = { f: string; o: FilterOp; v?: FilterValue };
const KNOWN_OPS = new Set(Object.values(OPERATORS).flatMap((ops) => ops.map((o) => o.op)));

function parseRules(raw: string | null): FilterRule[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as CompactRule[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && typeof r.f === "string" && KNOWN_OPS.has(r.o))
      .map((r, i) => ({ id: `u${i}`, field: r.f, op: r.o, value: r.v ?? null }));
  } catch {
    return [];
  }
}

function parseSort(raw: string | null): SortRule[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ id: s.replace(/^-/, ""), desc: s.startsWith("-") }));
}

export function useGridUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawFilters = searchParams.get("f");
  const rawSort = searchParams.get("sort");
  const match: "and" | "or" = searchParams.get("m") === "or" ? "or" : "and";

  const filters = useMemo(() => parseRules(rawFilters), [rawFilters]);
  const sort = useMemo(() => parseSort(rawSort), [rawSort]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      sp.delete("page");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setFilters = (rules: FilterRule[], nextMatch: "and" | "or" = match) => {
    const compact = toApiFilters(rules).map(({ field, op, value }) => ({
      f: field,
      o: op,
      ...(value !== null ? { v: value } : {}),
    }));
    update({ f: compact.length ? JSON.stringify(compact) : null, m: nextMatch === "or" ? "or" : null });
  };

  const setFiltersWith = (
    rules: FilterRule[],
    extra: Record<string, string | null>,
    nextMatch: "and" | "or" = "and"
  ) => {
    const compact = toApiFilters(rules).map(({ field, op, value }) => ({
      f: field,
      o: op,
      ...(value !== null ? { v: value } : {}),
    }));
    update({
      f: compact.length ? JSON.stringify(compact) : null,
      m: nextMatch === "or" ? "or" : null,
      ...extra,
    });
  };

  const setSort = (next: SortRule[]) =>
    update({ sort: next.length ? next.map((s) => (s.desc ? `-${s.id}` : s.id)).join(",") : null });

  const apiParams = useMemo(() => {
    const api = toApiFilters(filters);
    return {
      filters: api.length ? JSON.stringify(api) : undefined,
      match: api.length > 1 && match === "or" ? "or" : undefined,
      sort: rawSort || undefined,
    };
  }, [filters, match, rawSort]);

  return { filters, match, sort, setFilters, setFiltersWith, setSort, apiParams };
}

export interface GridPrefs {
  hidden?: string[];
  shown?: string[];
  sizes?: Record<string, number>;
  order?: string[];
  density?: Density;
  view?: GridView;
}

const cache = new Map<string, GridPrefs>();
const listeners = new Set<() => void>();
const EMPTY: GridPrefs = {};

function read(key: string): GridPrefs {
  if (!cache.has(key)) {
    let value: GridPrefs = EMPTY;
    try {
      value = JSON.parse(localStorage.getItem(key) ?? "null") ?? EMPTY;
    } catch {}
    cache.set(key, value);
  }
  return cache.get(key)!;
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

export function useGridPrefs(gridId: string) {
  const key = `sk-grid:${gridId}`;
  const prefs = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY
  );
  const save = useCallback(
    (patch: Partial<GridPrefs> | null) => {
      const next = patch === null ? EMPTY : { ...read(key), ...patch };
      cache.set(key, next);
      try {
        if (patch === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      listeners.forEach((fn) => fn());
    },
    [key]
  );
  return [prefs, save] as const;
}
