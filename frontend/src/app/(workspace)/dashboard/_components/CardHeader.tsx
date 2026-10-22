"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

import { CardHeader as AdminCardHeader } from "@/app/admin/_components/ui/index";
import { adminPortalTarget } from "@/app/admin/_components/ui/portal";

const TIP_WIDTH = 256;
const GAP = 6;
const EDGE = 8;

/**
 * An ⓘ icon that reveals `text` on hover, keyboard focus or tap (touch screens).
 * The tooltip is drawn in the page-level portal with fixed positioning and kept inside the
 * screen, so narrow or scrolling containers (cards, side panels) can never clip it.
 */
export function InfoHint({ text }: { text: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(TIP_WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(EDGE, rect.left - 8), window.innerWidth - width - EDGE);
    const above = rect.bottom + 120 > window.innerHeight && rect.top > 120;
    setPos({ left, top: above ? rect.top - GAP : rect.bottom + GAP, above });
  };
  const hide = () => setPos(null);

  // close when the page scrolls (the icon moves) or someone taps elsewhere
  useEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPos(null);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-describedby={pos ? id : undefined}
        aria-label="More information"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (pos ? hide() : show())}
        onKeyDown={(e) => e.key === "Escape" && hide()}
        className="text-fg-faint hover:text-fg-muted focus-visible:text-primary inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle transition focus:outline-none"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{
              left: pos.left,
              top: pos.top,
              width: Math.min(TIP_WIDTH, window.innerWidth - EDGE * 2),
              transform: pos.above ? "translateY(-100%)" : undefined,
            }}
            className="pointer-events-none fixed z-130 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed font-normal tracking-normal whitespace-normal text-white normal-case shadow-lg dark:bg-slate-700"
          >
            {text}
          </span>,
          adminPortalTarget()
        )}
    </>
  );
}

/**
 * The admin CardHeader, with its description moved into an ⓘ hint next to the title
 * so cards stay compact. Same props as the admin one.
 */
export function CardHeader({ title, description, ...rest }: ComponentProps<typeof AdminCardHeader>) {
  return (
    <AdminCardHeader
      {...rest}
      title={
        description ? (
          <span className="inline-flex items-center gap-1">
            {title}
            <InfoHint text={description} />
          </span>
        ) : (
          title
        )
      }
    />
  );
}
