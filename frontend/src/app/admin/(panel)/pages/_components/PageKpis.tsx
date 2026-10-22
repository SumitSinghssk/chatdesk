"use client";

import { CalendarClock, CheckCircle2, FileEdit, FilePen, FileText, ImageOff } from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import type { PageStats } from "@/app/admin/_lib/api/pagesApi";

export type PageKpi = "all" | "published" | "draft" | "scheduled" | "updated" | "no_image";

export function PageKpis({
  stats,
  active,
  onSelect,
}: {
  stats: PageStats | undefined;
  active: PageKpi | null;
  onSelect: (kpi: PageKpi) => void;
}) {
  const tile = (kpi: PageKpi) => ({ active: active === kpi, onClick: () => onSelect(kpi) });
  return (
    <KpiGrid>
      <KpiTile
        icon={FileText}
        label="All pages"
        value={stats?.total}
        hint="Static website pages"
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
        icon={FilePen}
        tone="purple"
        label="Edited recently"
        value={stats?.updated_30_days}
        hint="In the last 30 days"
        {...tile("updated")}
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
