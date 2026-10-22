import type { ReactNode } from "react";
import { ArrowRight, MousePointerClick } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge } from "@/app/admin/_components/ui/index";
import { REDIRECT_CODE_LABELS, type Redirect } from "@/app/admin/_lib/api/redirectsApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

export function CodeBadge({ row }: { row: Redirect }) {
  return (
    <Badge tone={row.status_code === 301 || row.status_code === 308 ? "info" : "warning"}>
      <span title={REDIRECT_CODE_LABELS[row.status_code]}>{row.status_code}</span>
    </Badge>
  );
}

function Route({ row }: { row: Redirect }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs">
      <span className="text-fg font-semibold break-all">{row.source_path}</span>
      <ArrowRight size={13} className="text-fg-subtle shrink-0" aria-label="redirects to" />
      <span className="text-primary break-all">{row.target_url}</span>
    </div>
  );
}

function Usage({ row }: { row: Redirect }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={row.last_hit_at ? `Last hit ${formatDateTime(row.last_hit_at)}` : undefined}
    >
      <MousePointerClick className="h-3.5 w-3.5" />
      {row.hits.toLocaleString()} · {row.last_hit_at ? timeAgo(row.last_hit_at) : "never"}
    </span>
  );
}

export function RedirectListItem({
  row,
  slots,
  status,
  actions,
}: {
  row: Redirect;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-0.5">{slots.checkbox}</span>}
      <div className="min-w-0 flex-1">
        <Route row={row} />
        {row.note && <p className="text-fg-subtle mt-0.5 truncate text-xs">{row.note}</p>}
        <div className="text-fg-subtle mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <CodeBadge row={row} />
          <Usage row={row} />
          {status}
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

export function RedirectCard({
  row,
  slots,
  status,
  actions,
}: {
  row: Redirect;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Route row={row} />
        </div>
        {slots.checkbox}
      </div>
      <p className="text-fg-subtle mt-2 mb-4 line-clamp-2 min-h-[2.5em] text-xs">
        {row.note || <span className="text-fg-faint italic">No note</span>}
      </p>
      <div className="border-line text-fg-subtle mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-xs">
        <CodeBadge row={row} />
        <Usage row={row} />
        <span className="ml-auto flex items-center gap-2">
          {status}
          {actions}
        </span>
      </div>
    </>
  );
}
