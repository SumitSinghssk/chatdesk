import { CalendarClock, Database, Download, FolderArchive, Hand, Trash2 } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge, Button } from "@/app/admin/_components/ui/index";
import type { Backup } from "@/app/admin/_lib/api/backupsApi";
import { formatBytes, formatDateTime } from "@/lib/utils";

import { BackupStatusCell } from "./BackupStatusCell";

export interface BackupRowActions {
  canDownload: boolean;
  canDelete: boolean;
  downloading: string | null;
  onDownload: (backup: Backup, file: string) => void;
  onDelete: (backup: Backup) => void;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function TriggerBadge({ trigger }: { trigger: Backup["trigger"] }) {
  return (
    <Badge tone={trigger === "scheduled" ? "brand" : "neutral"}>
      {trigger === "scheduled" ? <CalendarClock className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
      {trigger === "scheduled" ? "Scheduled" : "Manual"}
    </Badge>
  );
}

export function ContentsBadges({ row }: { row: Backup }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {row.includes_database && (
        <Badge tone="info">
          <Database className="h-3 w-3" />
          Database
        </Badge>
      )}
      {row.includes_files && (
        <Badge tone="warning">
          <FolderArchive className="h-3 w-3" />
          Files
        </Badge>
      )}
    </span>
  );
}

export function BackupButtons({ row, actions }: { row: Backup; actions: BackupRowActions }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {actions.canDownload &&
        row.downloads.map((d) => (
          <Button
            key={d.file}
            size="xs"
            variant="secondary"
            leftIcon={Download}
            loading={actions.downloading === `${row.id}/${d.file}`}
            onClick={() => actions.onDownload(row, d.file)}
            title={`${d.label} · ${formatBytes(d.size)}`}
          >
            {d.file.endsWith(".gz") ? "Database" : "Files"}
          </Button>
        ))}
      {actions.canDelete && (row.status !== "running" || row.stalled) && (
        <Button
          size="xs"
          variant="ghost"
          iconOnly
          aria-label={`Delete ${row.name}`}
          title="Delete backup"
          onClick={() => actions.onDelete(row)}
        >
          <Trash2 className="text-danger h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function meta(row: Backup) {
  return (
    <>
      {formatDateTime(row.started_at ?? row.created_at)}
      {row.user?.name && <> · by {row.user.name}</>}
      {row.duration_seconds !== null && <> · took {formatDuration(row.duration_seconds)}</>}
    </>
  );
}

export function BackupListItem({
  row,
  slots,
  actions,
}: {
  row: Backup;
  slots: RowSlots;
  actions: BackupRowActions;
}) {
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-0.5">{slots.checkbox}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-fg truncate font-semibold">{row.name}</p>
          <TriggerBadge trigger={row.trigger} />
          <span className="text-fg-muted ml-auto text-sm tabular-nums">
            {row.status === "completed" ? formatBytes(row.size) : ""}
          </span>
        </div>
        <p className="text-fg-subtle truncate text-xs">{meta(row)}</p>
        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2">
          <BackupStatusCell backup={row} />
          <ContentsBadges row={row} />
          <div className="ml-auto">
            <BackupButtons row={row} actions={actions} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BackupCard({
  row,
  slots,
  actions,
}: {
  row: Backup;
  slots: RowSlots;
  actions: BackupRowActions;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <FolderArchive className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate font-semibold">{row.name}</p>
          <p className="text-fg-subtle truncate text-xs">{meta(row)}</p>
        </div>
        {slots.checkbox}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <TriggerBadge trigger={row.trigger} />
        <ContentsBadges row={row} />
      </div>
      <div className="mt-3 mb-4">
        <BackupStatusCell backup={row} />
      </div>
      <div className="border-line mt-auto flex items-center gap-2 border-t pt-3">
        <span className="text-fg-muted text-sm font-medium tabular-nums">
          {row.status === "completed" ? formatBytes(row.size) : "—"}
        </span>
        <div className="ml-auto">
          <BackupButtons row={row} actions={actions} />
        </div>
      </div>
    </>
  );
}
