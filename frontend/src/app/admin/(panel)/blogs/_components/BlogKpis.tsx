"use client";

import { BookOpen, CalendarClock, CalendarRange, CheckCircle2, FileEdit, ImageOff } from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { BlogStats } from "@/app/admin/_lib/api/blogsApi";

export type BlogKpi = "all" | "published" | "draft" | "scheduled" | "recent" | "no_image";

export function BlogKpis({
  stats,
  active,
  onSelect,
}: {
  stats: BlogStats | undefined;
  active: BlogKpi | null;
  onSelect: (kpi: BlogKpi) => void;
}) {
  const tile = (kpi: BlogKpi) => ({ active: active === kpi, onClick: () => onSelect(kpi) });
  return (
    <KpiGrid>
      <KpiTile
        icon={BookOpen}
        label="All posts"
        value={stats?.total}
        hint={stats && (stats.uncategorized ? `${stats.uncategorized} uncategorized` : "All categorised")}
        {...tile("all")}
      />
      <KpiTile
        icon={CheckCircle2}
        tone="green"
        label="Published"
        value={stats?.published}
        hint="Live on the website"
        {...tile("published")}
      />
      <KpiTile
        icon={FileEdit}
        tone={stats?.draft ? "amber" : "slate"}
        label="Drafts"
        value={stats?.draft}
        hint="Not published yet"
        {...tile("draft")}
      />
      <KpiTile
        icon={CalendarClock}
        tone={stats?.scheduled ? "blue" : "slate"}
        label="Scheduled"
        value={stats?.scheduled}
        hint="Publish date in the future"
        {...tile("scheduled")}
      />
      <KpiTile
        icon={CalendarRange}
        tone="purple"
        label="Last 30 days"
        value={stats?.last_30_days}
        hint={
          stats && (
            <TrendHint current={stats.last_30_days} previous={stats.previous_30_days} suffix="published" />
          )
        }
        {...tile("recent")}
      />
      <KpiTile
        icon={ImageOff}
        tone={stats?.without_image ? "red" : "slate"}
        label="No featured image"
        value={stats?.without_image}
        hint={stats?.without_image ? "Add one for social shares" : "All set"}
        {...tile("no_image")}
      />
    </KpiGrid>
  );
}
