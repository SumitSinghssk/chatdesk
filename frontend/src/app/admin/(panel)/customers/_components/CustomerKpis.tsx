"use client";

import {
  CircleCheck,
  CircleOff,
  MessageCircle,
  MessageCircleOff,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { CustomerStats } from "@/app/admin/_lib/api/customersApi";

export type CustomerKpi = "all" | "active" | "inactive" | "recent" | "connected" | "not_connected";

export function CustomerKpis({
  stats,
  active,
  onSelect,
}: {
  stats: CustomerStats | undefined;
  active: CustomerKpi | null;
  onSelect: (kpi: CustomerKpi) => void;
}) {
  const failing = stats?.whatsapp.error ?? 0;
  return (
    <KpiGrid>
      <KpiTile
        icon={UsersRound}
        label="Customers"
        value={stats?.total}
        hint={
          stats && (
            <TrendHint
              current={stats.this_week}
              previous={stats.last_week}
              suffix={`${stats.this_week} joined in 7 days`}
            />
          )
        }
        active={active === "all"}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={MessageCircle}
        tone="green"
        label="WhatsApp connected"
        value={stats?.whatsapp.connected}
        hint={failing ? `${failing} need attention` : "Number working"}
        active={active === "connected"}
        onClick={() => onSelect("connected")}
      />
      <KpiTile
        icon={MessageCircleOff}
        tone={stats?.whatsapp.not_connected ? "amber" : "slate"}
        label="Not connected"
        value={stats?.whatsapp.not_connected}
        hint="No number added yet"
        active={active === "not_connected"}
        onClick={() => onSelect("not_connected")}
      />
      <KpiTile
        icon={UserRoundCheck}
        tone="purple"
        label="Active in 30 days"
        value={stats?.active_30d}
        hint="Signed in recently"
        active={active === "recent"}
        onClick={() => onSelect("recent")}
      />
      <KpiTile
        icon={CircleCheck}
        tone="green"
        label="Active"
        value={stats?.active}
        hint="Can sign in"
        active={active === "active"}
        onClick={() => onSelect("active")}
      />
      <KpiTile
        icon={CircleOff}
        tone={stats?.inactive ? "amber" : "slate"}
        label="Blocked"
        value={stats?.inactive}
        hint="Can't sign in"
        active={active === "inactive"}
        onClick={() => onSelect("inactive")}
      />
    </KpiGrid>
  );
}
