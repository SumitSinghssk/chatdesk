"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DrawerValue = number | "new" | null;

export function useUrlDrawer(key = "open") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(key);
  const value: DrawerValue = raw === "new" ? "new" : Number(raw) || null;

  const href = useCallback(
    (next: DrawerValue, drop: string[] = []) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const k of drop) sp.delete(k);
      if (next === null) sp.delete(key);
      else sp.set(key, String(next));
      const qs = sp.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [key, pathname, searchParams]
  );

  return {
    value,
    id: typeof value === "number" ? value : null,
    isNew: value === "new",
    isOpen: value !== null,
    href,
    open: (next: number | "new") => router.push(href(next), { scroll: false }),
    replace: (next: DrawerValue, drop?: string[]) => router.replace(href(next, drop), { scroll: false }),
    close: () => router.replace(href(null), { scroll: false }),
  };
}
