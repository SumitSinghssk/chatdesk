"use client";

import { Clock, CornerUpRight, FileQuestion, Flame, MousePointerClick } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { NotFoundStats } from "@/app/admin/_lib/api/notFoundApi";

export type NotFoundKpi = "open" | "recent" | "hits" | "redirected" | "ignored" | "top";

export function NotFoundKpis({
  stats,
  active,
  onSelect,
}: {
  stats: NotFoundStats | undefined;
  active: NotFoundKpi | null;
  onSelect: (kpi: NotFoundKpi) => void;
}) {
  return (
    <KpiGrid cols={6}>
      <KpiTile
        icon={FileQuestion}
        tone={stats?.open ? "red" : "slate"}
        label="Unresolved"
        value={stats?.open}
        hint={
          stats && (
            <TrendHint
              current={stats.new_this_week}
              previous={stats.new_last_week}
              suffix={`${stats.new_this_week} new this week`}
            />
          )
        }
        active={active === "open"}
        onClick={() => onSelect("open")}
      />
      <KpiTile
        icon={Clock}
        tone="amber"
        label="Last 24 hours"
        value={stats?.last_24h}
        hint="Paths requested"
        title="Show paths seen since yesterday"
        active={active === "recent"}
        onClick={() => onSelect("recent")}
      />
      <KpiTile
        icon={MousePointerClick}
        tone="blue"
        label="Total hits"
        value={stats?.total_hits.toLocaleString()}
        hint={stats && `${stats.all} logged paths`}
        title="All paths, most hits first"
        active={active === "hits"}
        onClick={() => onSelect("hits")}
      />
      <KpiTile
        icon={CornerUpRight}
        tone="green"
        label="Redirected"
        value={stats?.redirected}
        hint="Fixed with a redirect"
        active={active === "redirected"}
        onClick={() => onSelect("redirected")}
      />
      <KpiTile
        icon={Flame}
        tone={stats?.top ? "purple" : "slate"}
        label="Top unresolved"
        value={stats ? (stats.top?.hits.toLocaleString() ?? 0) : undefined}
        hint={stats && <span className="font-mono">{stats.top?.path ?? "Nothing open"}</span>}
        title={stats?.top ? `${stats.top.path} (${stats.top.hits} hits)` : undefined}
        active={active === "top"}
        onClick={stats?.top ? () => onSelect("top") : undefined}
      />
      <KpiMixTile
        label="Resolution"
        total={stats?.all}
        items={
          stats && [
            { key: "open", label: "Open", value: stats.open, color: "bg-red-500" },
            { key: "redirected", label: "Redirected", value: stats.redirected, color: "bg-emerald-500" },
            { key: "ignored", label: "Ignored", value: stats.ignored, color: "bg-slate-400" },
          ]
        }
        onSelect={(key) => onSelect(key as NotFoundKpi)}
        emptyText="Nothing logged yet"
      />
    </KpiGrid>
  );
}
