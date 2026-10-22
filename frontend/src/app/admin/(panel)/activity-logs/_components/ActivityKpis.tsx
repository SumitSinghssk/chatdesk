"use client";

import { CalendarDays, CalendarRange, LogIn, ShieldAlert, Users } from "lucide-react";

import { KpiGrid, KpiMixTile, KpiTile, TrendHint, type MixItem } from "@/app/admin/_components/grid";
import type { ActivityStats } from "@/app/admin/_lib/api/activityLogsApi";
import { titleCase } from "@/lib/utils";

export type ActivityKpi = "today" | "week" | "login" | "login_failed" | { action: string };

const ACTION_COLORS: Record<string, string> = {
  created: "bg-emerald-500",
  updated: "bg-violet-500",
  deleted: "bg-red-500",
  login: "bg-sky-500",
  login_failed: "bg-amber-500",
  logout: "bg-slate-400",
};
const MIX_COLORS = ["bg-indigo-500", "bg-pink-500", "bg-teal-500", "bg-orange-400", "bg-lime-500"];
const OTHER = "__other";
const TOP_ACTIONS = 5;

function actionMix(byAction: Record<string, number>): MixItem[] {
  const sorted = Object.entries(byAction).sort((a, b) => b[1] - a[1]);
  let extra = 0;
  const items: MixItem[] = sorted.slice(0, TOP_ACTIONS).map(([action, n]) => ({
    key: action,
    label: titleCase(action),
    value: n,
    color: ACTION_COLORS[action] ?? MIX_COLORS[extra++ % MIX_COLORS.length],
  }));
  const rest = sorted.slice(TOP_ACTIONS).reduce((s, [, n]) => s + n, 0);
  if (rest) items.push({ key: OTHER, label: "Other", value: rest, color: "bg-slate-300 dark:bg-slate-600" });
  return items;
}

export function ActivityKpis({
  stats,
  active,
  onSelect,
}: {
  stats: ActivityStats | undefined;
  active: ActivityKpi | null;
  onSelect: (kpi: ActivityKpi) => void;
}) {
  return (
    <KpiGrid>
      <KpiTile
        icon={CalendarDays}
        label="Events today"
        value={stats?.today}
        hint={stats && `${stats.total.toLocaleString()} all time`}
        active={active === "today"}
        onClick={() => onSelect("today")}
      />
      <KpiTile
        icon={CalendarRange}
        tone="blue"
        label="Last 7 days"
        value={stats?.this_week}
        hint={
          stats && <TrendHint current={stats.this_week} previous={stats.last_week} suffix="vs prior week" />
        }
        active={active === "week"}
        onClick={() => onSelect("week")}
      />
      <KpiTile
        icon={LogIn}
        tone="green"
        label="Sign-ins"
        value={stats?.logins}
        hint="Last 30 days"
        active={active === "login"}
        onClick={() => onSelect("login")}
      />
      <KpiTile
        icon={ShieldAlert}
        tone={stats?.failed_logins ? "red" : "slate"}
        label="Failed sign-ins"
        value={stats?.failed_logins}
        hint="Last 30 days"
        active={active === "login_failed"}
        onClick={() => onSelect("login_failed")}
      />
      <KpiTile
        icon={Users}
        tone="purple"
        label="Active users"
        value={stats?.active_users}
        hint={stats && `${stats.active_users_30_days} in 30 days`}
        title="Distinct users with activity in the last 7 days"
      />
      <KpiMixTile
        label="By action · 30 days"
        total={stats?.last_30_days}
        items={stats && actionMix(stats.by_action)}
        onSelect={(key) => key !== OTHER && onSelect({ action: key })}
        emptyText="No activity yet"
      />
    </KpiGrid>
  );
}
