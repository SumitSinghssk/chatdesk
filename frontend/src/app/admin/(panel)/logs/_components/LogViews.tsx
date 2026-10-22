import { AlertTriangle, FileText, Trash2, XOctagon } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Button } from "@/app/admin/_components/ui/index";
import type { LogFile } from "@/app/admin/_lib/api/logsApi";
import { cn, formatBytes, formatDate, formatDateTime, timeAgo } from "@/lib/utils";

export function LevelCounts({ file, className }: { file: LogFile; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-xs tabular-nums", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1",
          file.errors ? "text-danger font-medium" : "text-fg-faint"
        )}
        title="Errors"
      >
        <XOctagon className="h-3.5 w-3.5" />
        {file.errors ?? "—"}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1",
          file.warnings ? "text-warning font-medium" : "text-fg-faint"
        )}
        title="Warnings"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {file.warnings ?? "—"}
      </span>
    </span>
  );
}

function DeleteButton({ file, onDelete }: { file: LogFile; onDelete?: (name: string) => void }) {
  if (!onDelete) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      leftIcon={Trash2}
      aria-label={`Delete ${file.name}`}
      title="Delete"
      className="hover:bg-danger-soft hover:text-danger"
      onClick={() => onDelete(file.name)}
    />
  );
}

export function LogListItem({
  file,
  slots,
  active,
  onOpen,
  onDelete,
}: {
  file: LogFile;
  slots: RowSlots;
  active: boolean;
  onOpen: (name: string) => void;
  onDelete?: (name: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox && <span className="shrink-0">{slots.checkbox}</span>}
      <FileText className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-fg-subtle")} aria-hidden />
      <button type="button" onClick={() => onOpen(file.name)} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-sm font-medium", active ? "text-primary" : "text-fg")}>
          {file.name}
        </span>
        <span className="text-fg-subtle block truncate text-xs">
          {formatBytes(file.size)} ·{" "}
          <span title={formatDateTime(file.modified_at)}>{timeAgo(file.modified_at)}</span>
        </span>
      </button>
      <LevelCounts file={file} className="hidden shrink-0 sm:inline-flex" />
      <DeleteButton file={file} onDelete={onDelete} />
    </div>
  );
}

export function LogCard({
  file,
  slots,
  onOpen,
  onDelete,
}: {
  file: LogFile;
  slots: RowSlots;
  onOpen: (name: string) => void;
  onDelete?: (name: string) => void;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="bg-hover text-fg-subtle flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <FileText className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(file.name)}
            className="text-fg hover:text-primary block max-w-full truncate text-left font-semibold"
          >
            {file.date ? formatDate(file.date) : file.name}
          </button>
          <p className="text-fg-subtle truncate font-mono text-[11px]">{file.name}</p>
        </div>
        {slots.checkbox}
      </div>
      <LevelCounts file={file} className="mt-3 mb-4" />
      <div className="border-line mt-auto flex items-center gap-2 border-t pt-2 text-xs">
        <span className="text-fg-muted tabular-nums">{formatBytes(file.size)}</span>
        <span className="text-fg-subtle truncate" title={formatDateTime(file.modified_at)}>
          · {timeAgo(file.modified_at)}
        </span>
        <div className="ml-auto">
          <DeleteButton file={file} onDelete={onDelete} />
        </div>
      </div>
    </>
  );
}
