"use client";

import { CircleCheck, CircleOff, FileX, FolderTree, FolderOpen, GitBranch } from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { BlogCategoryStats } from "@/app/admin/_lib/api/blogCategoriesApi";

export type BlogCategoryKpi = "all" | "active" | "inactive" | "top_level" | "subcategories" | "empty";

export function BlogCategoryKpis({
  stats,
  active,
  onSelect,
}: {
  stats: BlogCategoryStats | undefined;
  active: BlogCategoryKpi | null;
  onSelect: (kpi: BlogCategoryKpi) => void;
}) {
  return (
    <KpiGrid>
      <KpiTile
        icon={FolderTree}
        label="Categories"
        value={stats?.total}
        hint={
          stats && (
            <TrendHint
              current={stats.this_week}
              previous={stats.last_week}
              suffix={`${stats.this_week} new in 7 days`}
            />
          )
        }
        active={active === "all"}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={CircleCheck}
        tone="green"
        label="Active"
        value={stats?.active}
        hint="Shown on the website"
        active={active === "active"}
        onClick={() => onSelect("active")}
      />
      <KpiTile
        icon={CircleOff}
        tone={stats?.inactive ? "amber" : "slate"}
        label="Inactive"
        value={stats?.inactive}
        hint="Hidden from the website"
        active={active === "inactive"}
        onClick={() => onSelect("inactive")}
      />
      <KpiTile
        icon={FolderOpen}
        tone="blue"
        label="Top-level"
        value={stats?.top_level}
        hint="No parent"
        active={active === "top_level"}
        onClick={() => onSelect("top_level")}
      />
      <KpiTile
        icon={GitBranch}
        tone="purple"
        label="Subcategories"
        value={stats?.subcategories}
        hint="Nested under a parent"
        active={active === "subcategories"}
        onClick={() => onSelect("subcategories")}
      />
      <KpiTile
        icon={FileX}
        tone={stats?.empty ? "red" : "slate"}
        label="Without posts"
        value={stats?.empty}
        hint={stats?.empty ? "Empty categories" : "Every category is used"}
        active={active === "empty"}
        onClick={() => onSelect("empty")}
      />
    </KpiGrid>
  );
}
