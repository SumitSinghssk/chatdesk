import type { ReactNode } from "react";
import { CornerDownRight, FileText } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import type { BlogCategory } from "@/app/admin/_lib/api/blogCategoriesApi";
import { cn, formatDate } from "@/lib/utils";

export function CategoryThumb({ row, className }: { row: BlogCategory; className?: string }) {
  return row.image ? (
    <img
      src={row.image}
      alt=""
      className={cn("ring-line shrink-0 rounded-lg object-cover ring-1", className)}
    />
  ) : (
    <span
      className={cn(
        "bg-primary-soft text-primary flex shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
        className
      )}
    >
      {row.name.charAt(0)}
    </span>
  );
}

const posts = (n: number | null) => `${n ?? 0} post${n === 1 ? "" : "s"}`;

export function BlogCategoryListItem({
  row,
  slots,
  status,
  actions,
}: {
  row: BlogCategory;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <CategoryThumb row={row} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="text-fg truncate font-semibold">{row.name}</p>
        <p className="text-fg-subtle truncate text-xs">
          /{row.slug}
          {row.parent && <> · in {row.parent.name}</>}
          <span className="sm:hidden"> · {posts(row.blog_count)}</span>
        </p>
      </div>
      <span className="text-fg-subtle hidden shrink-0 text-xs sm:block">{posts(row.blog_count)}</span>
      <span className="shrink-0">{status}</span>
      <span className="hidden shrink-0 sm:block">{actions}</span>
    </div>
  );
}

export function BlogCategoryCard({
  row,
  slots,
  status,
  actions,
}: {
  row: BlogCategory;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <CategoryThumb row={row} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate font-semibold">{row.name}</p>
          <p className="text-fg-faint truncate font-mono text-[11px]">/{row.slug}</p>
        </div>
        {slots.checkbox}
      </div>

      <p className="text-fg-subtle mt-2 flex min-h-5 items-center gap-1 truncate text-xs">
        {row.parent ? (
          <>
            <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">in {row.parent.name}</span>
          </>
        ) : (
          "Top-level category"
        )}
      </p>

      <p className="text-fg-subtle mt-2 mb-4 line-clamp-2 min-h-[2.5em] text-sm">
        {row.description || "No description"}
      </p>

      <div className="border-line mt-auto flex items-center gap-2 border-t pt-3 text-xs">
        <span className="text-fg-muted inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {posts(row.blog_count)}
        </span>
        <span className="text-fg-faint hidden sm:inline">· {formatDate(row.created_at)}</span>
        <span className="ml-auto flex items-center gap-2">
          {status}
          {actions}
        </span>
      </div>
    </>
  );
}
