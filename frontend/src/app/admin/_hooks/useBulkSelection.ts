"use client";

import { useCallback, useMemo, useState } from "react";

export function useBulkSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback((ids: number[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      ids: [...selected],
      count: selected.size,
      isSelected: (id: number) => selected.has(id),
      pageState: (ids: number[]): "none" | "some" | "all" => {
        const n = ids.filter((id) => selected.has(id)).length;
        return n === 0 ? "none" : n === ids.length ? "all" : "some";
      },
      toggle,
      togglePage,
      clear,
    }),
    [selected, toggle, togglePage, clear]
  );
}

export type BulkSelection = ReturnType<typeof useBulkSelection>;
