import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge } from "@/app/admin/_components/ui/index";
import type { SeoPage } from "@/app/admin/_lib/api/seoApi";
import { formatDate } from "@/lib/utils";

function IndexBadge({ row }: { row: SeoPage }) {
  return row.allow_indexing ? (
    <Badge tone="success" dot>
      Indexed
    </Badge>
  ) : (
    <Badge tone="warning" dot>
      No-index
    </Badge>
  );
}

function FaqCount({ row }: { row: SeoPage }) {
  if (!row.faqs.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <HelpCircle className="h-3.5 w-3.5" />
      {row.faqs.length} FAQ{row.faqs.length === 1 ? "" : "s"}
    </span>
  );
}

export function SeoListItem({ row, slots, actions }: { row: SeoPage; slots: RowSlots; actions: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-0.5">{slots.checkbox}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-fg truncate font-semibold">{row.page}</span>
          {row.is_default && <Badge tone="brand">Default</Badge>}
          <span className="text-fg-subtle hidden truncate font-mono text-xs sm:inline">{row.path}</span>
        </div>
        <p className="text-fg-subtle truncate font-mono text-xs sm:hidden">{row.path}</p>
        <p className="text-fg-muted mt-0.5 truncate text-sm">
          {row.meta_title || <span className="text-fg-subtle italic">No meta title</span>}
          {row.meta_description && <span className="text-fg-subtle"> — {row.meta_description}</span>}
        </p>
        <div className="text-fg-subtle mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <IndexBadge row={row} />
          {!row.meta_description && <span className="text-danger">No description</span>}
          <FaqCount row={row} />
          <span>Updated {formatDate(row.updated_at)}</span>
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

export function SeoCard({ row, slots, actions }: { row: SeoPage; slots: RowSlots; actions: ReactNode }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="text-fg truncate font-semibold">{row.page}</span>
            {row.is_default && <Badge tone="brand">Default</Badge>}
          </p>
          <p className="text-fg-subtle truncate font-mono text-xs">{row.path}</p>
        </div>
        {slots.checkbox}
      </div>

      <div className="bg-page mt-3 mb-4 rounded-lg p-3">
        <p className="truncate text-sm font-medium text-sky-700 dark:text-sky-400">
          {row.meta_title || <span className="text-fg-subtle italic">No meta title</span>}
        </p>
        <p className="text-fg-subtle mt-1 line-clamp-2 min-h-[2.5em] text-xs">
          {row.meta_description || <span className="text-danger italic">No meta description</span>}
        </p>
      </div>

      <div className="border-line text-fg-subtle mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs">
        <IndexBadge row={row} />
        <FaqCount row={row} />
        <span className="ml-auto">{actions}</span>
      </div>
    </>
  );
}
