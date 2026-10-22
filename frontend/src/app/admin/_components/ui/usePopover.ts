"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function usePopover({
  matchWidth = true,
  minWidth = 0,
  maxHeight = 288,
}: {
  matchWidth?: boolean;
  minWidth?: number;
  maxHeight?: number;
} = {}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(matchWidth ? rect.width : 0, minWidth);
    const panelHeight = Math.min(panel.scrollHeight, maxHeight);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const flip = below < panelHeight && above > below;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - Math.max(width, panel.offsetWidth) - 8);
    setStyle({
      position: "fixed",
      left,
      ...(flip ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      ...(width ? { minWidth: width } : {}),
      ...(matchWidth ? { width } : {}),
      maxHeight: Math.max(160, Math.min(maxHeight, flip ? above : below)),
    });
  }, [matchWidth, minWidth, maxHeight]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      const other = (target as Element).closest?.(".popover-panel");
      if (other && isNestedPanel(panelRef.current, other)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasNestedPanel(panelRef.current)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, place]);

  const setTrigger = useCallback((el: HTMLElement | null) => {
    triggerRef.current = el;
  }, []);
  const setPanel = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
  }, []);
  const focusTrigger = useCallback(() => triggerRef.current?.focus(), []);
  const withPanel = useCallback((fn: (panel: HTMLDivElement) => void) => {
    requestAnimationFrame(() => panelRef.current && fn(panelRef.current));
  }, []);

  return { open, setOpen, style, setTrigger, setPanel, focusTrigger, withPanel, reposition: place };
}

function isNestedPanel(panel: Element | null, other: Element) {
  return (
    !!panel && other !== panel && !!(panel.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

function hasNestedPanel(panel: Element | null) {
  if (!panel) return false;
  return Array.from(document.querySelectorAll(".popover-panel")).some((el) => isNestedPanel(panel, el));
}

export const popoverPanelClass =
  "popover-panel z-[120] flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg";
