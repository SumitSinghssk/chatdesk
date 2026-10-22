"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { adminPortalTarget } from "@/app/admin/_components/ui/portal";
import { cn } from "@/lib/utils";

const GAP = 6;
const EDGE = 8;

/**
 * Same props as the admin Tooltip, but drawn in the page-level portal with fixed positioning,
 * so tables, chat lists and other scrolling containers can never clip it. Kept on screen
 * horizontally and flipped above/below when there isn't room.
 */
export function Tooltip({
  label,
  children,
  side = "bottom",
  align = "center",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    if (window.matchMedia("(hover: none)").matches) return; // no hover tooltips on touch screens
    setPos(null);
    setRect(anchor.current?.getBoundingClientRect() ?? null);
  };
  const hide = () => setRect(null);

  // measure the tooltip once rendered, then place it inside the viewport
  useEffect(() => {
    if (!rect || !tip.current) return;
    const { width, height } = tip.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    const below = side === "bottom" ? roomBelow > height + GAP + EDGE : rect.top < height + GAP + EDGE;
    let left =
      align === "start"
        ? rect.left
        : align === "end"
          ? rect.right - width
          : rect.left + rect.width / 2 - width / 2;
    left = Math.min(Math.max(EDGE, left), window.innerWidth - width - EDGE);
    setPos({ left, top: below ? rect.bottom + GAP : rect.top - height - GAP });
  }, [rect, side, align]);

  useEffect(() => {
    if (!rect) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [rect]);

  return (
    <span
      ref={anchor}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={hide}
    >
      {children}
      {rect &&
        createPortal(
          <span
            ref={tip}
            role="tooltip"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
            className="pointer-events-none fixed z-130 max-w-xs rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700"
          >
            {label}
          </span>,
          adminPortalTarget()
        )}
    </span>
  );
}
