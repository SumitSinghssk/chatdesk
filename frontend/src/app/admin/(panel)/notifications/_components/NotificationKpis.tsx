"use client";

import { BellDot, CalendarDays, CalendarRange } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { NotificationStats } from "@/app/admin/_lib/api/notificationsApi";

import { typeMeta } from "./NotificationViews";

export type NotificationKpiAction = "unread" | "today" | "week" | { type: string };

export function NotificationKpis({
  stats,
  onSelect,
}: {
  stats: NotificationStats | undefined;
  onSelect: (action: NotificationKpiAction) => void;
}) {
  return (
    <KpiGrid cols={4}>
      <KpiTile
        icon={BellDot}
        tone={stats?.unread ? "indigo" : "slate"}
        label="Unread"
        value={stats?.unread}
        hint={stats && (stats.unread ? `of ${stats.total} total` : "You're all caught up")}
        onClick={() => onSelect("unread")}
      />
      <KpiTile
        icon={CalendarDays}
        tone="blue"
        label="Today"
        value={stats?.today}
        hint={stats && `${stats.unread_today} unread`}
        onClick={() => onSelect("today")}
      />
      <KpiTile
        icon={CalendarRange}
        tone="green"
        label="Last 7 days"
        value={stats?.this_week}
        hint={
          stats && <TrendHint current={stats.this_week} previous={stats.last_week} suffix="vs prior week" />
        }
        onClick={() => onSelect("week")}
      />
      <KpiMixTile
        label="By type"
        total={stats?.total}
        items={stats?.by_type.map((t, i) => ({
          key: t.type,
          label: typeMeta(t.type, i).label,
          value: t.count,
          color: typeMeta(t.type, i).dot,
        }))}
        onSelect={(type) => onSelect({ type })}
        emptyText="No notifications yet"
      />
    </KpiGrid>
  );
}
