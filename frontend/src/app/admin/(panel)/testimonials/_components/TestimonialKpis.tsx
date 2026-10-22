"use client";

import { CircleCheck, CircleOff, MessageSquareQuote, Sparkles, Star } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { TestimonialStats } from "@/app/admin/_lib/api/testimonialsApi";

export type TestimonialKpi = "all" | "active" | "inactive" | "featured" | "top_rated" | { rating: number };

const RATING_COLORS: Record<string, string> = {
  "5": "bg-emerald-500",
  "4": "bg-lime-500",
  "3": "bg-amber-500",
  "2": "bg-orange-500",
  "1": "bg-red-500",
};

export function TestimonialKpis({
  stats,
  active,
  onSelect,
}: {
  stats: TestimonialStats | undefined;
  active: string | null;
  onSelect: (kpi: TestimonialKpi) => void;
}) {
  return (
    <KpiGrid>
      <KpiTile
        icon={MessageSquareQuote}
        label="Testimonials"
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
        hint="Hidden"
        active={active === "inactive"}
        onClick={() => onSelect("inactive")}
      />
      <KpiTile
        icon={Sparkles}
        tone="purple"
        label="Featured"
        value={stats?.featured}
        hint={stats && `${stats.featured_live} live on the site`}
        active={active === "featured"}
        onClick={() => onSelect("featured")}
      />
      <KpiTile
        icon={Star}
        tone="amber"
        label="Average rating"
        value={stats && (stats.average_rating !== null ? `${stats.average_rating.toFixed(1)} ★` : "—")}
        hint={stats && `${stats.rated} rated · show 4★+`}
        active={active === "top_rated"}
        onClick={() => onSelect("top_rated")}
      />
      <KpiMixTile
        label="By rating"
        total={stats?.rated}
        items={
          stats &&
          Object.entries(stats.by_rating).map(([stars, n]) => ({
            key: stars,
            label: `${stars}★`,
            value: n,
            color: RATING_COLORS[stars] ?? "bg-slate-400",
          }))
        }
        onSelect={(stars) => onSelect({ rating: Number(stars) })}
        emptyText="No ratings yet"
      />
    </KpiGrid>
  );
}
