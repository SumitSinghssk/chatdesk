"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { PaginationMeta } from "@/app/admin/_lib/api/types";
import { cn } from "@/lib/utils";

import { Select } from "./Select";

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight)
      return node;
  }
  return null;
}

function pageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | null)[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push(null);
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push(null);
  pages.push(total);
  return pages;
}

export function Pagination({
  meta,
  onPageChange,
  onPerPageChange,
  unit = "results",
  className,
}: {
  meta: PaginationMeta | null | undefined;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  unit?: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  if (!meta || meta.total === 0) return null;
  const { page, per_page, total, total_pages } = meta;
  const start = (page - 1) * per_page + 1;
  const end = Math.min(page * per_page, total);

  const toTop = () => {
    const scroller = scrollParent(rootRef.current);
    if (scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goTo = (p: number) => {
    onPageChange(p);
    toTop();
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "border-line text-fg-subtle flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span>
          <b className="text-fg font-medium">
            {start}–{end}
          </b>{" "}
          of <b className="text-fg font-medium">{total}</b> {unit}
        </span>
        {onPerPageChange && (
          <div className="flex items-center gap-2">
            <span>Per page</span>
            <Select
              size="sm"
              aria-label="Rows per page"
              searchable={false}
              value={per_page}
              onChange={(v) => {
                onPerPageChange(Number(v));
                toTop();
              }}
              options={[...new Set([...PER_PAGE_OPTIONS, per_page])]
                .sort((a, b) => a - b)
                .map((n) => ({ value: n, label: String(n) }))}
              wrapperClassName="w-auto"
              className="h-8 w-19 text-xs font-medium"
              menuWidth={96}
            />
          </div>
        )}
      </div>
      <nav aria-label="Pagination" className="ml-auto flex items-center gap-1">
        <PageButton aria-label="Previous page" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          <ChevronLeft size={14} />
        </PageButton>
        {pageList(page, total_pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1">
              …
            </span>
          ) : (
            <PageButton
              key={p}
              active={p === page}
              aria-current={p === page ? "page" : undefined}
              onClick={() => goTo(p)}
            >
              {p}
            </PageButton>
          )
        )}
        <PageButton aria-label="Next page" disabled={page >= total_pages} onClick={() => goTo(page + 1)}>
          <ChevronRight size={14} />
        </PageButton>
      </nav>
    </div>
  );
}

function PageButton({
  active,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "tabular inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-primary text-primary-fg shadow-xs" : "text-fg-muted hover:bg-hover hover:text-fg",
        className
      )}
      {...rest}
    />
  );
}
