import { ArchiveRestore, Clock, FileX2, XCircle } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Button } from "@/app/admin/_components/ui/index";
import type { TrashItem } from "@/app/admin/_lib/api/trashApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

export interface TrashRowActions {
  canRestore: boolean;
  canDelete: boolean;
  onRestore: (row: TrashItem) => void;
  onDelete: (row: TrashItem) => void;
}

export function TrashRowButtons({
  row,
  actions,
  compact,
}: {
  row: TrashItem;
  actions: TrashRowActions;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {actions.canRestore && (
        <Button
          size="sm"
          variant={compact ? "ghost" : "secondary"}
          leftIcon={ArchiveRestore}
          onClick={() => actions.onRestore(row)}
        >
          Restore
        </Button>
      )}
      {actions.canDelete && (
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          leftIcon={XCircle}
          aria-label={`Delete ${row.title} forever`}
          title="Delete forever"
          className="hover:bg-danger-soft hover:text-danger"
          onClick={() => actions.onDelete(row)}
        />
      )}
    </div>
  );
}

export function TrashListItem({
  row,
  slots,
  typeLabel,
  actions,
}: {
  row: TrashItem;
  slots: RowSlots;
  typeLabel: string;
  actions: TrashRowActions;
}) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox && <span className="shrink-0">{slots.checkbox}</span>}
      <span className="bg-hover text-fg-subtle hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:flex">
        <FileX2 className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg truncate font-medium">{row.title}</p>
        <p className="text-fg-subtle truncate text-xs">
          {row.subtitle && <>{row.subtitle} · </>}
          <span title={formatDateTime(row.deleted_at)}>Deleted {timeAgo(row.deleted_at)}</span>
          <span className="hidden sm:inline"> · {typeLabel}</span>
        </p>
      </div>
      <div className="shrink-0">
        <TrashRowButtons row={row} actions={actions} compact />
      </div>
    </div>
  );
}

export function TrashCard({
  row,
  slots,
  typeLabel,
  actions,
}: {
  row: TrashItem;
  slots: RowSlots;
  typeLabel: string;
  actions: TrashRowActions;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="bg-hover text-fg-subtle flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <FileX2 className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate font-semibold">{row.title}</p>
          <p className="text-fg-subtle truncate text-xs">{typeLabel}</p>
        </div>
        {slots.checkbox}
      </div>
      <p className="text-fg-muted mt-3 mb-4 line-clamp-2 min-h-[2.5em] text-sm">
        {row.subtitle || <span className="text-fg-faint">No details</span>}
      </p>
      <div className="border-line mt-auto flex items-center gap-2 border-t pt-3 text-xs">
        <span
          className="text-fg-subtle inline-flex min-w-0 items-center gap-1"
          title={formatDateTime(row.deleted_at)}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{timeAgo(row.deleted_at)}</span>
        </span>
        <div className="ml-auto">
          <TrashRowButtons row={row} actions={actions} compact />
        </div>
      </div>
    </>
  );
}
