"use client";

import { AlertTriangle, CalendarClock, HardDrive, ShieldCheck } from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import type { BackupStats } from "@/app/admin/_lib/api/backupsApi";
import { formatBytes, formatDate, formatDateTime, timeAgo } from "@/lib/utils";

export type BackupKpiAction = "completed" | "size" | "failed" | "schedule";

const STALE_MS = 2 * 24 * 60 * 60 * 1000;
const nextRunFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function BackupKpis({
  stats,
  checkedAt,
  onSelect,
}: {
  stats: BackupStats | undefined;
  checkedAt: number;
  onSelect: (action: BackupKpiAction) => void;
}) {
  const last = stats?.last_success;
  const stale = !!last && checkedAt - new Date(last.finished_at).getTime() > STALE_MS;
  return (
    <KpiGrid cols={4}>
      <KpiTile
        icon={ShieldCheck}
        tone={!stats ? "slate" : !last ? "red" : stale ? "amber" : "green"}
        label="Last good backup"
        value={stats && (last ? timeAgo(last.finished_at) : "Never")}
        hint={last ? `${formatBytes(last.size)} · ${formatDate(last.finished_at)}` : "Make your first backup"}
        title={last ? `${last.name} · ${formatDateTime(last.finished_at)}` : undefined}
        onClick={() => onSelect("completed")}
      />
      <KpiTile
        icon={HardDrive}
        tone="blue"
        label="Storage used"
        value={stats && formatBytes(stats.total_size)}
        hint={stats && `${stats.completed} completed backup(s)`}
        onClick={() => onSelect("size")}
      />
      <KpiTile
        icon={AlertTriangle}
        tone={stats?.failed_30d ? "red" : "slate"}
        label="Failed (30 days)"
        value={stats?.failed_30d}
        hint={stats && (stats.failed_30d ? "Check the error details" : "No failures")}
        onClick={() => onSelect("failed")}
      />
      <KpiTile
        icon={CalendarClock}
        tone={stats?.schedule_enabled ? "purple" : "slate"}
        label="Next scheduled run"
        value={stats && (stats.next_run_at ? nextRunFmt.format(new Date(stats.next_run_at)) : "Off")}
        hint={stats && (stats.next_run_at ? formatDate(stats.next_run_at) : "Automatic backups are off")}
        title={stats?.schedule_description}
        onClick={() => onSelect("schedule")}
      />
    </KpiGrid>
  );
}
