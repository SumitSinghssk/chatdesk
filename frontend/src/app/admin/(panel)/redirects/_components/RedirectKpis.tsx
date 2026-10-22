"use client";

import { CircleSlash, MousePointerClick, Power, Route } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile } from "@/app/admin/_components/grid";
import { REDIRECT_CODES, REDIRECT_CODE_LABELS, type RedirectStats } from "@/app/admin/_lib/api/redirectsApi";

export type RedirectKpi = "all" | "active" | "hits" | "unused" | { code: string };

const CODE_COLORS: Record<string, string> = {
  "301": "bg-sky-500",
  "302": "bg-amber-500",
  "307": "bg-orange-400",
  "308": "bg-indigo-500",
};

export function RedirectKpis({
  stats,
  active,
  onSelect,
}: {
  stats: RedirectStats | undefined;
  active: RedirectKpi | null;
  onSelect: (kpi: RedirectKpi) => void;
}) {
  return (
    <KpiGrid cols={5}>
      <KpiTile
        icon={Route}
        label="Redirects"
        value={stats?.total}
        hint={stats && `${stats.inactive} inactive`}
        active={active === "all"}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={Power}
        tone="green"
        label="Active"
        value={stats?.active}
        hint="Currently redirecting"
        active={active === "active"}
        onClick={() => onSelect("active")}
      />
      <KpiTile
        icon={MousePointerClick}
        tone="blue"
        label="Total hits"
        value={stats?.total_hits.toLocaleString()}
        hint={stats && `${stats.hit_last_30_days} used in 30 days`}
        title="Sort by most hits"
        active={active === "hits"}
        onClick={() => onSelect("hits")}
      />
      <KpiTile
        icon={CircleSlash}
        tone={stats?.unused ? "amber" : "slate"}
        label="Unused"
        value={stats?.unused}
        hint="Never hit yet"
        active={active === "unused"}
        onClick={() => onSelect("unused")}
      />
      <KpiMixTile
        label="By type"
        total={stats?.total}
        items={
          stats &&
          REDIRECT_CODES.map((code) => ({
            key: String(code),
            label: REDIRECT_CODE_LABELS[code],
            value: stats.by_code[`${code}`] ?? 0,
            color: CODE_COLORS[code],
          }))
        }
        onSelect={(code) => onSelect({ code })}
        emptyText="No redirects yet"
      />
    </KpiGrid>
  );
}
