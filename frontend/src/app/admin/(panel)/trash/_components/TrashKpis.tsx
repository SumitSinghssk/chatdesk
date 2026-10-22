"use client";

import { Archive, Hourglass, History } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile } from "@/app/admin/_components/grid";
import type { TrashStats } from "@/app/admin/_lib/api/trashApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

const TYPE_COLORS = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-slate-400",
];

export type TrashKpiAction = "all" | "stale" | "oldest" | { type: string };

export function TrashKpis({
  stats,
  onSelect,
}: {
  stats: TrashStats | undefined;
  onSelect: (action: TrashKpiAction) => void;
}) {
  return (
    <KpiGrid cols={4}>
      <KpiTile
        icon={Archive}
        label="In the trash"
        value={stats?.total}
        hint={stats && `${stats.by_type.filter((t) => t.count > 0).length} type(s)`}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={Hourglass}
        tone={stats?.stale ? "amber" : "slate"}
        label={`Older than ${stats?.stale_days ?? 30} days`}
        value={stats?.stale}
        hint={stats?.stale ? "Good candidates to delete" : "Nothing old"}
        onClick={() => onSelect("stale")}
      />
      <KpiTile
        icon={History}
        tone={stats?.oldest ? "red" : "slate"}
        label="Oldest item"
        value={stats && (stats.oldest ? timeAgo(stats.oldest.deleted_at) : "—")}
        hint={stats?.oldest ? stats.oldest.label : "Trash is empty"}
        title={stats?.oldest ? `Deleted ${formatDateTime(stats.oldest.deleted_at)}` : undefined}
        onClick={stats?.oldest ? () => onSelect("oldest") : undefined}
      />
      <KpiMixTile
        label="By type"
        total={stats?.total}
        items={stats?.by_type.map((t, i) => ({
          key: t.type,
          label: t.label,
          value: t.count,
          color: TYPE_COLORS[i % TYPE_COLORS.length]!,
        }))}
        onSelect={(type) => onSelect({ type })}
        emptyText="The trash is empty"
      />
    </KpiGrid>
  );
}
