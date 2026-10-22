"use client";

import { Ban, CircleCheck, Clock, MessagesSquare, ShieldAlert, UserRoundCheck } from "lucide-react";

import { KpiGrid, KpiTile, TrendHint } from "@/app/admin/_components/grid";
import type { CommentStats } from "@/app/admin/_lib/api/commentsApi";

export type CommentKpi = "all" | "pending" | "approved" | "rejected" | "spam" | "admin";

export function CommentKpis({
  stats,
  active,
  onSelect,
}: {
  stats: CommentStats | undefined;
  active: CommentKpi | null;
  onSelect: (kpi: CommentKpi) => void;
}) {
  return (
    <KpiGrid>
      <KpiTile
        icon={MessagesSquare}
        label="Comments"
        value={stats?.total}
        hint={
          stats && (
            <TrendHint
              current={stats.this_week}
              previous={stats.last_week}
              suffix={`${stats.this_week} in 7 days`}
            />
          )
        }
        active={active === "all"}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={Clock}
        tone={stats?.pending ? "amber" : "slate"}
        label="Awaiting approval"
        value={stats?.pending}
        hint={stats?.pending ? "Not shown on the website yet" : "Nothing to review"}
        active={active === "pending"}
        onClick={() => onSelect("pending")}
      />
      <KpiTile
        icon={CircleCheck}
        tone="green"
        label="Approved"
        value={stats?.approved}
        hint="Visible on the website"
        active={active === "approved"}
        onClick={() => onSelect("approved")}
      />
      <KpiTile
        icon={Ban}
        tone="slate"
        label="Rejected"
        value={stats?.rejected}
        hint="Hidden from the website"
        active={active === "rejected"}
        onClick={() => onSelect("rejected")}
      />
      <KpiTile
        icon={ShieldAlert}
        tone={stats?.spam ? "red" : "slate"}
        label="Spam"
        value={stats?.spam}
        hint="Marked as spam"
        active={active === "spam"}
        onClick={() => onSelect("spam")}
      />
      <KpiTile
        icon={UserRoundCheck}
        tone="purple"
        label="Team replies"
        value={stats?.admin_replies}
        hint="Replies from your team"
        active={active === "admin"}
        onClick={() => onSelect("admin")}
      />
    </KpiGrid>
  );
}
