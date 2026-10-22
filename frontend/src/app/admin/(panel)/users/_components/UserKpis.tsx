"use client";

import { Lock, ShieldCheck, UserCheck, Users as UsersIcon, UserX, Wifi } from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { UserStats } from "@/app/admin/_lib/api/usersApi";

export type UserKpi = "all" | "active" | "inactive" | "locked" | "two_factor" | "online";

export function UserKpis({
  stats,
  active,
  onSelect,
}: {
  stats: UserStats | undefined;
  active: UserKpi | null;
  onSelect: (kpi: UserKpi) => void;
}) {
  const pct = (n: number) => (stats?.total ? Math.round((n / stats.total) * 100) : 0);
  return (
    <KpiGrid>
      <KpiTile
        icon={UsersIcon}
        label="Total users"
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
        icon={UserCheck}
        tone="green"
        label="Active"
        value={stats?.active}
        hint={stats && `${pct(stats.active)}% of users`}
        active={active === "active"}
        onClick={() => onSelect("active")}
      />
      <KpiTile
        icon={UserX}
        tone={stats?.inactive ? "amber" : "slate"}
        label="Inactive"
        value={stats?.inactive}
        hint="Can't sign in"
        active={active === "inactive"}
        onClick={() => onSelect("inactive")}
      />
      <KpiTile
        icon={Lock}
        tone={stats?.locked ? "red" : "slate"}
        label="Locked"
        value={stats?.locked}
        hint={stats?.locked ? "Too many failed sign-ins" : "No lockouts"}
        active={active === "locked"}
        onClick={() => onSelect("locked")}
      />
      <KpiTile
        icon={ShieldCheck}
        tone="purple"
        label="2FA enabled"
        value={stats?.two_factor}
        hint={stats && `${pct(stats.two_factor)}% coverage`}
        active={active === "two_factor"}
        onClick={() => onSelect("two_factor")}
      />
      <KpiTile
        icon={Wifi}
        tone="blue"
        label="Online now"
        value={stats?.online}
        hint="Active in the last 5 min"
        active={active === "online"}
        onClick={() => onSelect("online")}
      />
    </KpiGrid>
  );
}
