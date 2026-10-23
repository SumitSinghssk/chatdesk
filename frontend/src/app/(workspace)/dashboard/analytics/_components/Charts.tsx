"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

import type { AnalyticsReport, DailyRow } from "../../_lib/analyticsApi";

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });
export const parseDay = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
export const nf = new Intl.NumberFormat("en-IN");

export interface Series {
  key: keyof DailyRow;
  label: string;
  color: string;
}

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="text-fg-subtle flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DayTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: { payload: DailyRow }[];
  series: Series[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border-line bg-surface min-w-36 rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-fg-subtle mb-1">{longFmt.format(parseDay(row.date))}</p>
      {series.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4">
          <span className="text-fg-subtle flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
          <span className="text-fg font-semibold tabular-nums">{nf.format(Number(row[s.key]))}</span>
        </p>
      ))}
    </div>
  );
}

const axis = { fill: "var(--fg-subtle)", fontSize: 11 };

/** Change over time: one thin line per measure on one shared axis. */
export function TrendChart({ data, series, label }: { data: DailyRow[]; series: Series[]; label: string }) {
  return (
    <div className="space-y-2">
      <Legend series={series} />
      <div className="h-64 w-full" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => dayFmt.format(parseDay(v))}
              tick={axis}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
              content={<DayTooltip series={series} />}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={data.length <= 14 ? { r: 3, strokeWidth: 0, fill: s.color } : false}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Counts per day side by side (new chats vs resolved). */
export function DayBars({ data, series, label }: { data: DailyRow[]; series: Series[]; label: string }) {
  return (
    <div className="space-y-2">
      {series.length > 1 && <Legend series={series} />}
      <div className="h-56 w-full" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
            barGap={2}
            barCategoryGap="20%"
          >
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => dayFmt.format(parseDay(v))}
              tick={axis}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={48} />
            <Tooltip cursor={{ fill: "var(--hover)" }} content={<DayTooltip series={series} />} />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) =>
  h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

/** When customers write: weekday × hour, darker = more messages (one hue). */
export function Heatmap({ grid, timezone }: { grid: number[][]; timezone: string }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  let peak = { d: 0, h: 0, n: 0 };
  grid.forEach((row, d) => row.forEach((n, h) => n > peak.n && (peak = { d, h, n })));
  const shown = hover ?? (peak.n ? peak : null);
  return (
    <div className="space-y-3">
      <p className="text-fg-subtle min-h-5 text-xs" aria-live="polite">
        {total === 0 ? (
          "No customer messages in this period."
        ) : shown ? (
          <>
            {hover ? "" : "Busiest: "}
            <b className="text-fg">
              {DAYS[shown.d]} {hourLabel(shown.h)}–{hourLabel((shown.h + 1) % 24)}
            </b>
            {" · "}
            {nf.format(grid[shown.d]![shown.h]!)} message{grid[shown.d]![shown.h] === 1 ? "" : "s"}
          </>
        ) : null}
      </p>
      <div className="overflow-x-auto">
        <table
          className="min-w-[560px] border-separate border-spacing-[3px]"
          aria-label={`Customer messages by day and hour (${timezone})`}
        >
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} scope="col" className="text-fg-faint text-[10px] font-normal">
                  {h % 3 === 0 ? (
                    hourLabel(h).replace(" ", "")
                  ) : (
                    <span className="sr-only">{hourLabel(h)}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={d}>
                <th scope="row" className="text-fg-subtle pr-1 text-left text-[11px] font-medium">
                  {DAYS[d]}
                </th>
                {row.map((n, h) => (
                  <td
                    key={h}
                    onMouseEnter={() => setHover({ d, h })}
                    onMouseLeave={() => setHover(null)}
                    title={`${DAYS[d]} ${hourLabel(h)}: ${n}`}
                    className={cn(
                      "h-6 min-w-4 rounded-[4px]",
                      hover?.d === d && hover?.h === h && "ring-fg ring-2"
                    )}
                    style={{
                      background:
                        n === 0
                          ? "var(--hover)"
                          : `color-mix(in oklab, var(--viz-1) ${Math.round(18 + (82 * n) / max)}%, var(--surface))`,
                    }}
                  >
                    <span className="sr-only">{n}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-fg-faint flex items-center gap-2 text-[11px]">
        Fewer
        <span
          className="h-2.5 w-28 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklab, var(--viz-1) 18%, var(--surface)), var(--viz-1))",
          }}
          aria-hidden
        />
        More · times in {timezone.replace("_", " ")}
      </div>
    </div>
  );
}

/** Parts of a whole, each bar labelled with its number and share (identity by label, not colour alone). */
export function ShareBars({
  items,
}: {
  items: { label: string; value: number; color: string; hint?: string }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="space-y-3" aria-label="Breakdown">
      {items.map((i) => {
        const pct = total ? Math.round((100 * i.value) / total) : 0;
        return (
          <li key={i.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: i.color }}
                  aria-hidden
                />
                <span className="truncate">{i.label}</span>
                {i.hint && <span className="text-fg-faint hidden truncate text-xs sm:inline">{i.hint}</span>}
              </span>
              <span className="text-fg-subtle shrink-0 text-xs tabular-nums">
                <b className="text-fg text-sm">{nf.format(i.value)}</b> · {pct}%
              </span>
            </div>
            <div className="bg-hover h-2 overflow-hidden rounded-full">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: i.color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Sent → delivered → read: each step as a share of the one before it. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = steps[0]?.value ?? 0;
  return (
    <ol className="space-y-2.5" aria-label="Delivery funnel">
      {steps.map((s, i) => {
        const pct = first ? Math.round((100 * s.value) / first) : 0;
        return (
          <li key={s.label} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="text-fg-subtle">{s.label}</span>
            <span className="bg-hover h-7 overflow-hidden rounded-md">
              <span
                className="flex h-full items-center rounded-md"
                style={{
                  width: `${Math.max(pct, s.value ? 2 : 0)}%`,
                  background: `color-mix(in oklab, var(--viz-1) ${100 - i * 22}%, var(--surface))`,
                }}
              />
            </span>
            <span className="text-fg w-24 text-right tabular-nums">
              <b>{nf.format(s.value)}</b> <span className="text-fg-subtle text-xs">{i ? `${pct}%` : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type { AnalyticsReport };
