import type { ReactNode } from "react";
import { ArrowRight, Clock, Link2, MousePointerClick } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge } from "@/app/admin/_components/ui/index";
import type { NotFoundLog } from "@/app/admin/_lib/api/notFoundApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

export function RedirectInfo({ row }: { row: NotFoundLog }) {
  if (!row.redirect && !row.ignored) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {row.ignored && <Badge tone="neutral">Ignored</Badge>}
      {row.redirect && (
        <span className="text-fg-subtle inline-flex min-w-0 items-center gap-1 font-mono text-xs">
          <ArrowRight size={12} className="shrink-0" aria-label="redirects to" />
          <span className={row.has_redirect ? "text-success truncate" : "truncate line-through"}>
            {row.redirect.target_url}
          </span>
          {!row.has_redirect && <Badge tone="warning">Inactive</Badge>}
        </span>
      )}
    </span>
  );
}

function Meta({ row }: { row: NotFoundLog }) {
  return (
    <>
      <span className="text-fg inline-flex items-center gap-1 font-semibold">
        <MousePointerClick className="h-3.5 w-3.5" />
        {row.hits.toLocaleString()}
      </span>
      <span
        className="inline-flex items-center gap-1"
        title={`First seen ${formatDateTime(row.first_seen_at)}`}
      >
        <Clock className="h-3.5 w-3.5" />
        {timeAgo(row.last_seen_at)}
      </span>
    </>
  );
}

function Referrer({ row }: { row: NotFoundLog }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={row.last_referrer ?? undefined}>
      <Link2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{row.last_referrer || "Direct"}</span>
    </span>
  );
}

export function NotFoundListItem({
  row,
  slots,
  actions,
}: {
  row: NotFoundLog;
  slots: RowSlots;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-0.5">{slots.checkbox}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-fg font-mono text-xs font-semibold break-all">{row.path}</p>
        <div className="mt-1">
          <RedirectInfo row={row} />
        </div>
        <div className="text-fg-subtle mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Meta row={row} />
          <span className="max-w-full min-w-0">
            <Referrer row={row} />
          </span>
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

export function NotFoundCard({
  row,
  slots,
  actions,
}: {
  row: NotFoundLog;
  slots: RowSlots;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        <p className="text-fg min-w-0 flex-1 font-mono text-xs font-semibold break-all">{row.path}</p>
        {slots.checkbox}
      </div>
      <div className="mt-2 mb-3 min-h-5">
        <RedirectInfo row={row} />
      </div>
      <p className="text-fg-subtle mb-4 text-xs">
        <Referrer row={row} />
      </p>
      <div className="border-line text-fg-subtle mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-xs">
        <Meta row={row} />
        <span className="ml-auto">{actions}</span>
      </div>
    </>
  );
}
