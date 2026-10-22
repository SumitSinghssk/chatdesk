"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlModal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const id = Number(searchParams.get("id")) || null;
  const focus = Number(searchParams.get("focus")) || null;

  const set = useCallback(
    (next: { action: "create" | "edit"; id?: number } | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("action");
      sp.delete("id");
      if (next) {
        sp.set("action", next.action);
        if (next.id) sp.set("id", String(next.id));
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return {
    isCreate: action === "create",
    editId: action === "edit" ? id : null,
    isOpen: action === "create" || (action === "edit" && !!id),
    focusId: focus,
    openCreate: () => set({ action: "create" }),
    openEdit: (editId: number) => set({ action: "edit", id: editId }),
    close: () => set(null),
  };
}
