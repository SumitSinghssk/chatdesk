"use client";

import { useCallback, useEffect, useState } from "react";

const WIDTH_KEY = "sk_sidebar_width";
export const MIN_WIDTH = 200;
export const MAX_WIDTH = 420;
const COLLAPSE_AT = 140;

function applyWidth(px: number | null) {
  const root = document.documentElement;
  if (px === null) root.style.removeProperty("--sidebar-w");
  else root.style.setProperty("--sidebar-w", `${px}px`);
}

export function useSidebarResize({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
}) {
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) applyWidth(saved);
  }, []);

  const save = (px: number | null) => {
    try {
      if (px === null) localStorage.removeItem(WIDTH_KEY);
      else localStorage.setItem(WIDTH_KEY, String(px));
    } catch {}
  };

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0 || window.innerWidth < 1024) return;
      event.preventDefault();
      setResizing(true);
      document.body.classList.add("cursor-col-resize", "select-none");
      let width: number | null = null;
      let isCollapsed = collapsed;

      const move = (e: PointerEvent) => {
        if (e.clientX < COLLAPSE_AT) {
          if (!isCollapsed) setCollapsed((isCollapsed = true));
          return;
        }
        if (isCollapsed) setCollapsed((isCollapsed = false));
        width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
        applyWidth(width);
      };
      const stop = () => {
        setResizing(false);
        document.body.classList.remove("cursor-col-resize", "select-none");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        if (width !== null) save(width);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [collapsed, setCollapsed]
  );

  const nudge = useCallback(
    (delta: number, sidebarEl: HTMLElement | null) => {
      if (collapsed) {
        if (delta > 0) setCollapsed(false);
        return;
      }
      const current = sidebarEl?.offsetWidth ?? MIN_WIDTH;
      if (delta < 0 && current <= MIN_WIDTH) {
        setCollapsed(true);
        return;
      }
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current + delta));
      applyWidth(next);
      save(next);
    },
    [collapsed, setCollapsed]
  );

  const reset = useCallback(() => {
    applyWidth(null);
    save(null);
    if (collapsed) setCollapsed(false);
  }, [collapsed, setCollapsed]);

  return { resizing, startResize, nudge, reset };
}
