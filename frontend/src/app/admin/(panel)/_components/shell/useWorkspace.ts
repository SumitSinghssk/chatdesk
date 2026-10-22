"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { usePermissions } from "@/app/admin/_hooks/usePermissions";

import { navSections, workspaceFor, workspaces, type WorkspaceKey } from "@/config/navigation";

import { ADMIN_ROUTES } from "@/config/routes";
const LAST_KEY = "sk_workspace";
const urlKey = (key: WorkspaceKey) => `sk_workspace_url_${key}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useWorkspace() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const can = usePermissions();
  const owner = workspaceFor(pathname);
  const [lastUsed] = useState<WorkspaceKey | null>(() =>
    typeof window === "undefined" ? null : (read(LAST_KEY) as WorkspaceKey | null)
  );

  const available = useMemo(
    () =>
      (Object.keys(workspaces) as WorkspaceKey[])
        .map((key) => {
          const first = navSections
            .filter((s) => s.workspace === key)
            .flatMap((s) => s.items)
            .find((item) => can(item.permission));
          return first ? { key, ...workspaces[key], firstHref: first.href } : null;
        })
        .filter((w): w is NonNullable<typeof w> => w !== null),
    [can]
  );

  const current: WorkspaceKey =
    (owner && available.some((w) => w.key === owner) ? owner : null) ??
    (lastUsed && available.some((w) => w.key === lastUsed) ? lastUsed : null) ??
    available[0]?.key ??
    "admin";

  useEffect(() => {
    if (!owner) return;
    try {
      const qs = searchParams.toString();
      localStorage.setItem(LAST_KEY, owner);
      localStorage.setItem(urlKey(owner), qs ? `${pathname}?${qs}` : pathname);
    } catch {}
  }, [owner, pathname, searchParams]);

  const hrefFor = (key: WorkspaceKey) => {
    const target = available.find((w) => w.key === key);
    if (!target) return ADMIN_ROUTES.DASHBOARD();
    if (key === current) return target.firstHref;
    const last = read(urlKey(key));
    return last && last.startsWith("/admin/") ? last : target.firstHref;
  };

  return { current, available, hrefFor, subtitle: workspaces[current].subtitle };
}
