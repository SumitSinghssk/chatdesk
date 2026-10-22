"use client";

import { CircleCheck, CircleOff, ImageOff, Layers, Star, UsersRound } from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { TeamStats } from "@/app/admin/_lib/api/teamApi";

export type TeamKpi = "all" | "active" | "inactive" | "featured" | "no_photo";

export function TeamKpis({
  stats,
  active,
  onSelect,
}: {
  stats: TeamStats | undefined;
  active: TeamKpi | null;
  onSelect: (kpi: TeamKpi) => void;
}) {
  return (
    <KpiGrid>
      <KpiTile
        icon={UsersRound}
        label="Team members"
        value={stats?.total}
        hint={
          stats && (
            <TrendHint
              current={stats.this_week}
              previous={stats.last_week}
              suffix={`${stats.this_week} added in 7 days`}
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
        icon={Star}
        tone="purple"
        label="Featured"
        value={stats?.featured}
        hint="Highlighted on the home page"
        active={active === "featured"}
        onClick={() => onSelect("featured")}
      />
      <KpiTile
        icon={Layers}
        tone="blue"
        label="Departments"
        value={stats?.departments.length}
        hint={stats?.departments.slice(0, 3).join(", ") || "None set"}
      />
      <KpiTile
        icon={ImageOff}
        tone={stats?.without_photo ? "red" : "slate"}
        label="Without photo"
        value={stats?.without_photo}
        hint={stats?.without_photo ? "Add a photo for each person" : "Everyone has a photo"}
        active={active === "no_photo"}
        onClick={() => onSelect("no_photo")}
      />
    </KpiGrid>
  );
}
