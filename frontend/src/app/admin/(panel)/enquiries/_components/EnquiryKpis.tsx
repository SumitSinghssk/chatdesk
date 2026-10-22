"use client";

import { AlarmClock, CalendarRange, Inbox, MailOpen, UserX } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { EnquiryStats, EnquiryStatus } from "@/app/admin/_lib/api/enquiriesApi";

import { STATUS_DOTS, STATUS_LABELS } from "./constants";

export type KpiAction = "open" | "unread" | "follow_up" | "unassigned" | "week" | { status: EnquiryStatus };

export function EnquiryKpis({
  stats,
  onSelect,
}: {
  stats: EnquiryStats | undefined;
  onSelect: (action: KpiAction) => void;
}) {
  return (
    <KpiGrid>
      <KpiTile
        icon={Inbox}
        label="Open"
        value={stats?.open}
        hint={stats && `${stats.new} new`}
        onClick={() => onSelect("open")}
      />
      <KpiTile
        icon={MailOpen}
        tone="blue"
        label="Unread"
        value={stats?.unseen}
        hint="Not opened yet"
        onClick={() => onSelect("unread")}
      />
      <KpiTile
        icon={AlarmClock}
        tone={stats?.follow_up_due ? "red" : "slate"}
        label="Follow-up due"
        value={stats?.follow_up_due}
        hint={stats?.follow_up_due ? "Needs attention" : "All caught up"}
        onClick={() => onSelect("follow_up")}
      />
      <KpiTile
        icon={UserX}
        tone={stats?.unassigned ? "amber" : "slate"}
        label="Unassigned"
        value={stats?.unassigned}
        hint="Open, no owner"
        onClick={() => onSelect("unassigned")}
      />
      <KpiTile
        icon={CalendarRange}
        tone="green"
        label="Last 7 days"
        value={stats?.this_week}
        hint={
          stats && (
            <TrendHint current={stats.this_week} previous={stats.last_week} suffix={`${stats.today} today`} />
          )
        }
        onClick={() => onSelect("week")}
      />
      <KpiMixTile
        label="By status"
        total={stats?.total}
        items={
          stats &&
          (Object.entries(stats.by_status) as [EnquiryStatus, number][]).map(([status, n]) => ({
            key: status,
            label: STATUS_LABELS[status],
            value: n,
            color: STATUS_DOTS[status],
          }))
        }
        onSelect={(status) => onSelect({ status: status as EnquiryStatus })}
        emptyText="No enquiries yet"
      />
    </KpiGrid>
  );
}
