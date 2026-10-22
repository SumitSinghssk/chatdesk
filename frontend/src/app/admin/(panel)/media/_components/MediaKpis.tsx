"use client";

import { CalendarRange, FileText, HardDrive, ImageIcon, Images, TextCursorInput } from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { MediaStats } from "@/app/admin/_lib/api/mediaApi";
import { formatBytes } from "@/lib/utils";

export type MediaKpi = "all" | "image" | "document" | "recent" | "missing_alt";

export function MediaKpis({
  stats,
  active,
  onSelect,
}: {
  stats: MediaStats | undefined;
  active: MediaKpi | null;
  onSelect: (kpi: MediaKpi) => void;
}) {
  const tile = (kpi: MediaKpi) => ({ active: active === kpi, onClick: () => onSelect(kpi) });
  return (
    <KpiGrid>
      <KpiTile
        icon={Images}
        label="Files"
        value={stats?.total.toLocaleString()}
        hint={stats && `In ${stats.folders} ${stats.folders === 1 ? "folder" : "folders"}`}
        {...tile("all")}
      />
      <KpiTile
        icon={ImageIcon}
        tone="green"
        label="Images"
        value={stats?.images.toLocaleString()}
        hint={stats && formatBytes(stats.image_size)}
        {...tile("image")}
      />
      <KpiTile
        icon={FileText}
        tone="amber"
        label="Documents"
        value={stats?.documents.toLocaleString()}
        hint="PDF, Word, Excel, CSV…"
        {...tile("document")}
      />
      <KpiTile
        icon={HardDrive}
        tone="purple"
        label="Storage used"
        value={stats ? formatBytes(stats.total_size) : undefined}
        hint={
          stats?.total ? `~${formatBytes(stats.total_size / stats.total)} per file` : "Nothing stored yet"
        }
      />
      <KpiTile
        icon={CalendarRange}
        tone="blue"
        label="Last 7 days"
        value={stats?.last_7_days}
        hint={
          stats && (
            <TrendHint current={stats.last_7_days} previous={stats.previous_7_days} suffix="uploaded" />
          )
        }
        {...tile("recent")}
      />
      <KpiTile
        icon={TextCursorInput}
        tone={stats?.missing_alt ? "red" : "slate"}
        label="Missing alt text"
        value={stats?.missing_alt}
        hint={stats?.missing_alt ? "Images without a description" : "All images described"}
        {...tile("missing_alt")}
      />
    </KpiGrid>
  );
}
