"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Database,
  Gauge,
  MessageCircle,
  PiggyBank,
  ThumbsUp,
  Timer,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import { Card, CardHeader, Skeleton } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { ShareBars } from "../../../analytics/_components/Charts";
import { AI_QK, aiAgentApi, compact, usd, type Agent, type Usage as U } from "../../../_lib/aiAgentApi";

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const parse = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
};
const axis = { fill: "var(--fg-subtle)", fontSize: 11 };

function DayTip({ active, payload }: { active?: boolean; payload?: { payload: U["daily"][number] }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border-line bg-surface min-w-36 rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-subtle mb-1">{dayFmt.format(parse(row.date))}</p>
      <p className="flex justify-between gap-4">
        <span className="text-fg-subtle">Replies</span>
        <b className="text-fg tabular-nums">{row.replies}</b>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-fg-subtle">Handed over</span>
        <b className="text-fg tabular-nums">{row.handovers}</b>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-fg-subtle">Cost</span>
        <b className="text-fg tabular-nums">{usd(row.cost)}</b>
      </p>
    </div>
  );
}

export function Usage({ agent }: { agent: Agent }) {
  const [days, setDays] = useState(30);
  const usage = useQuery({
    queryKey: AI_QK.USAGE(agent.id, days),
    queryFn: () => aiAgentApi.usage(agent.id, days).then((r) => r.data),
  });
  const u = usage.data;
  if (!u) return <Skeleton className="h-96 rounded-xl" />;
  const o = u.outcomes;
  const handover = o.handover ?? 0;
  const rated = u.feedback.up + u.feedback.down;
  const budget = u.budget ? Math.min(100, Math.round((100 * u.month_cost) / u.budget)) : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="bg-hover flex rounded-lg p-0.5" role="radiogroup" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium",
                days === d ? "bg-surface text-fg shadow-xs" : "text-fg-subtle"
              )}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>
      <KpiGrid cols={4}>
        <KpiTile
          icon={MessageCircle}
          tone="green"
          label="Replies"
          value={compact.format(u.replies)}
          hint={`${Object.values(u.channels).reduce((a, b) => a + (b ?? 0), 0)} conversations`}
        />
        <KpiTile
          icon={UserRoundCheck}
          tone="amber"
          label="Handed to team"
          value={compact.format(handover)}
          hint={u.replies ? `${Math.round((100 * handover) / u.replies)}% of replies` : undefined}
        />
        <KpiTile
          icon={Wallet}
          tone="purple"
          label="AI cost"
          value={usd(u.cost)}
          hint={u.memory_cost ? `incl. ${usd(u.memory_cost)} for memory` : "Billed by your provider"}
        />
        <KpiTile
          icon={PiggyBank}
          tone="blue"
          label="Saved by caching"
          value={usd(u.saved)}
          hint={`${compact.format(u.tokens.cached)} tokens from cache`}
        />
        <KpiTile
          icon={Database}
          tone="indigo"
          label="Saved answers reused"
          value={compact.format(u.cache_hits)}
          hint="No AI call at all"
        />
        <KpiTile
          icon={Timer}
          tone="slate"
          label="Average reply time"
          value={u.avg_latency_ms ? `${(u.avg_latency_ms / 1000).toFixed(1)}s` : "—"}
        />
        <KpiTile
          icon={ThumbsUp}
          tone="green"
          label="Rated good"
          value={rated ? `${Math.round((100 * u.feedback.up) / rated)}%` : "—"}
          hint={`${rated} ratings`}
        />
        <KpiTile
          icon={Gauge}
          tone="slate"
          label="Tokens"
          value={compact.format(u.tokens.input + u.tokens.cached + u.tokens.output)}
          hint={`${compact.format(u.tokens.input + u.tokens.cached)} in · ${compact.format(u.tokens.output)} out`}
        />
      </KpiGrid>

      {u.budget > 0 && (
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-fg text-sm font-semibold">Monthly budget</p>
            <p className="text-fg-subtle text-sm tabular-nums">
              <b className="text-fg">{usd(u.month_cost)}</b> of {usd(u.budget)}
            </p>
          </div>
          <div
            className="bg-hover mt-2 h-2.5 overflow-hidden rounded-full"
            role="meter"
            aria-valuenow={budget ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Budget used"
          >
            <div
              className={cn(
                "h-full rounded-full",
                (budget ?? 0) >= 90 ? "bg-danger" : (budget ?? 0) >= 70 ? "bg-warning" : "bg-success"
              )}
              style={{ width: `${budget}%` }}
            />
          </div>
          <p className="text-fg-subtle mt-1.5 text-xs">
            When it&apos;s used up, the agent stops and chats go to your team until next month.
          </p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Replies per day"
            description="Hover a day for its replies, handovers and cost."
          />
          <div className="h-60 px-3 pb-4" role="img" aria-label="Replies per day">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={u.daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => dayFmt.format(parse(v))}
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={48} />
                <Tooltip cursor={{ fill: "var(--hover)" }} content={<DayTip />} />
                <Bar
                  dataKey="replies"
                  fill="var(--viz-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="How it answered" />
          <div className="p-5">
            <ShareBars
              items={[
                { label: "Answered", value: o.answered ?? 0, color: "var(--viz-3)" },
                { label: "Saved answer reused", value: o.cached ?? 0, color: "var(--viz-1)" },
                { label: "Handed to team", value: handover, color: "var(--viz-4)" },
                { label: "Didn't know", value: o.unknown ?? 0, color: "var(--viz-2)" },
              ]}
            />
            {(o.failed ?? 0) > 0 && (
              <p className="text-danger mt-3 text-xs">{o.failed} replies failed (AI provider errors).</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
