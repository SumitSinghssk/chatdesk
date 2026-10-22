"use client";

import { CheckCircle2, FolderOpen, Images, ImageOff, Star, Video } from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import type { GalleryStats } from "@/app/admin/_lib/api/galleriesApi";

export type GalleryKpi = "all" | "active" | "featured" | "empty" | "videos" | "no_cover";

export function GalleryKpis({
  stats,
  active,
  onSelect,
}: {
  stats: GalleryStats | undefined;
  active: GalleryKpi | null;
  onSelect: (kpi: GalleryKpi) => void;
}) {
  const tile = (kpi: GalleryKpi) => ({ active: active === kpi, onClick: () => onSelect(kpi) });
  return (
    <KpiGrid>
      <KpiTile
        icon={Images}
        label="Galleries"
        value={stats?.total}
        hint={stats && `${stats.images.toLocaleString()} photos in total`}
        {...tile("all")}
      />
      <KpiTile
        icon={CheckCircle2}
        tone="green"
        label="Active"
        value={stats?.active}
        hint={stats && `${stats.inactive} inactive`}
        {...tile("active")}
      />
      <KpiTile
        icon={Star}
        tone="purple"
        label="Featured"
        value={stats?.featured}
        hint="Highlighted on the website"
        {...tile("featured")}
      />
      <KpiTile
        icon={Video}
        tone="blue"
        label="Videos"
        value={stats?.videos}
        hint="Galleries with YouTube videos"
        {...tile("videos")}
      />
      <KpiTile
        icon={FolderOpen}
        tone={stats?.empty ? "amber" : "slate"}
        label="Empty"
        value={stats?.empty}
        hint={stats?.empty ? "No photos or videos yet" : "Every gallery has items"}
        {...tile("empty")}
      />
      <KpiTile
        icon={ImageOff}
        tone={stats?.without_cover ? "red" : "slate"}
        label="No cover"
        value={stats?.without_cover}
        hint={stats && `${stats.items_last_7_days} items added this week`}
        {...tile("no_cover")}
      />
    </KpiGrid>
  );
}
