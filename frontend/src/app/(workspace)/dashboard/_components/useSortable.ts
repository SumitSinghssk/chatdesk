"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Drag-to-reorder for a vertical list, with a mouse, a finger or the keyboard (arrow keys on the
 * handle). Rows move live while dragging; `onCommit` gets the new order once it is dropped.
 *
 *   const sort = useSortable(ids, (next) => api.reorder(next));
 *   sort.order.map((id) => <li ref={sort.rowRef(id)}> <button {...sort.handleProps(id)} /> … </li>)
 */
export function useSortable<T extends string | number>(
  ids: T[],
  onCommit: (next: T[]) => Promise<unknown> | void
) {
  const [order, setOrder] = useState<T[] | null>(null);
  const [dragging, setDragging] = useState<T | null>(null);
  const rows = useRef(new Map<T, HTMLElement>());
  const shown = order ?? ids;

  const commit = (start: T[], next: T[]) => {
    if (next.join() === start.join()) {
      setOrder(null);
      return;
    }
    setOrder(next);
    void Promise.resolve(onCommit(next)).finally(() => setOrder(null));
  };

  const onPointerDown = (id: T) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = [...shown];
    // where each row's middle was when the drag began: the drop slots
    const mids = start.map((i) => {
      const r = rows.current.get(i)?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : 0;
    });
    const from = start.indexOf(id);
    let current = start;
    setDragging(id);
    setOrder(start);

    const move = (ev: globalThis.PointerEvent) => {
      const target = mids.filter((m, k) => k !== from && m < ev.clientY).length;
      const next = start.filter((i) => i !== id);
      next.splice(target, 0, id);
      if (next.join() !== current.join()) {
        current = next;
        setOrder(next);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDragging(null);
      commit(start, current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKeyDown = (id: T) => (e: KeyboardEvent<HTMLElement>) => {
    const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    const from = shown.indexOf(id);
    if (!by || from + by < 0 || from + by >= shown.length) return;
    e.preventDefault();
    const next = [...shown];
    [next[from], next[from + by]] = [next[from + by]!, next[from]!];
    commit(shown, next);
  };

  return {
    order: shown,
    dragging,
    rowRef: (id: T) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    handleProps: (id: T) => ({
      onPointerDown: onPointerDown(id),
      onKeyDown: onKeyDown(id),
      style: { touchAction: "none" as const },
    }),
  };
}
