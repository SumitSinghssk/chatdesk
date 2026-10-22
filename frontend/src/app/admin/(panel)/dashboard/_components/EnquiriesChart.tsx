"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { date: string; total: number } }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="border-line bg-surface rounded-md border px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-fg-subtle">{longFmt.format(parseDay(point.date))}</p>
      <p className="text-fg font-semibold">
        {point.total} {point.total === 1 ? "enquiry" : "enquiries"}
      </p>
    </div>
  );
}

export function EnquiriesChart({ data }: { data: { date: string; total: number }[] }) {
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Bar chart of enquiries received per day over the last 14 days"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => dayFmt.format(parseDay(v))}
            tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip cursor={{ fill: "var(--hover)" }} content={<ChartTooltip />} />
          <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
