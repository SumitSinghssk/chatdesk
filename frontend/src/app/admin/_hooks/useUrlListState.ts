"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDebouncedValue } from "./useDebouncedValue";

export function useUrlListState<F extends string>({
  filterKeys,
  defaultPerPage = 20,
  debounceMs = 300,
}: {
  filterKeys: readonly F[];
  defaultPerPage?: number;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Math.max(1, Number(searchParams.get("per_page")) || defaultPerPage);
  const search = searchParams.get("search") ?? "";
  const filterSignature = filterKeys.map((k) => searchParams.get(k) ?? "").join("|");
  const filters = useMemo(
    () => Object.fromEntries(filterKeys.map((k) => [k, searchParams.get(k) ?? ""])) as Record<F, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterSignature]
  );

  const update = useCallback(
    (changes: Record<string, string | number | null>, resetPage = true) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "" || value === "all") sp.delete(key);
        else sp.set(key, String(value));
      }
      if (resetPage && !("page" in changes)) sp.delete("page");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const [searchInput, setSearchInput] = useState(search);
  const [urlSearch, setUrlSearch] = useState(search);
  if (urlSearch !== search) {
    setUrlSearch(search);
    setSearchInput(search);
  }
  const debounced = useDebouncedValue(searchInput, debounceMs);
  useEffect(() => {
    if (debounced !== search) update({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const params = useMemo(
    () => ({ page, per_page: perPage, search: search || undefined, ...filters }),
    [page, perPage, search, filters]
  );

  return {
    page,
    perPage,
    search,
    filters,
    params,
    searchInput,
    setSearchInput,
    setPage: (p: number) => update({ page: p <= 1 ? null : p }, false),
    setPerPage: (n: number) => update({ per_page: n === defaultPerPage ? null : n }),
    setFilter: (key: F, value: string) => update({ [key]: value }),
    setFilters: (changes: Partial<Record<F, string>>) => update(changes as Record<string, string>),
    reset: () => {
      setSearchInput("");
      router.replace(pathname, { scroll: false });
    },
    hasFilters: !!search || filterKeys.some((k) => !!filters[k]),
  };
}
