"use client";

import { EyeOff, FileSearch, FileWarning, Globe, HelpCircle, Type } from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import type { SeoStats } from "@/app/admin/_lib/api/seoApi";

export type SeoKpi = "all" | "indexable" | "noindex" | "no_description" | "no_title" | "faqs";

export function SeoKpis({
  stats,
  active,
  onSelect,
}: {
  stats: SeoStats | undefined;
  active: SeoKpi | null;
  onSelect: (kpi: SeoKpi) => void;
}) {
  const pct = (n: number) =>
    stats?.total ? `${Math.round((n / stats.total) * 100)}% of entries` : undefined;
  return (
    <KpiGrid>
      <KpiTile
        icon={FileSearch}
        label="SEO entries"
        value={stats?.total}
        hint={stats && (stats.has_default ? "Incl. site-wide default" : "No * default yet")}
        active={active === "all"}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={Globe}
        tone="green"
        label="Indexable"
        value={stats?.indexable}
        hint={stats && pct(stats.indexable)}
        active={active === "indexable"}
        onClick={() => onSelect("indexable")}
      />
      <KpiTile
        icon={EyeOff}
        tone={stats?.noindex ? "amber" : "slate"}
        label="No-index"
        value={stats?.noindex}
        hint="Hidden from search engines"
        active={active === "noindex"}
        onClick={() => onSelect("noindex")}
      />
      <KpiTile
        icon={FileWarning}
        tone={stats?.missing_description ? "red" : "slate"}
        label="No meta description"
        value={stats?.missing_description}
        hint={stats?.missing_description ? "Needs a description" : "All described"}
        active={active === "no_description"}
        onClick={() => onSelect("no_description")}
      />
      <KpiTile
        icon={Type}
        tone={stats?.missing_title ? "amber" : "slate"}
        label="No meta title"
        value={stats?.missing_title}
        hint="Falls back to the page name"
        active={active === "no_title"}
        onClick={() => onSelect("no_title")}
      />
      <KpiTile
        icon={HelpCircle}
        tone="purple"
        label="With FAQs"
        value={stats?.with_faqs}
        hint="FAQ rich results"
        active={active === "faqs"}
        onClick={() => onSelect("faqs")}
      />
    </KpiGrid>
  );
}
