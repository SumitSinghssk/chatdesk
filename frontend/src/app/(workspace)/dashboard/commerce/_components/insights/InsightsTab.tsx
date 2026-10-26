"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Bot, IndianRupee, Megaphone, Receipt, ShoppingBag, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import { EmptyState, ErrorBanner, Skeleton } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { formatMoney, STORES_QK, storesApi, type Insights } from "../../../_lib/commerceApi";

const PERIODS = [7, 30, 90] as const;
const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });
const nf = new Intl.NumberFormat("en-IN");
const parseDay = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const axis = { fill: "var(--fg-subtle)", fontSize: 11 };
// one hue per part, in a fixed order (the dashboard's validated 4-colour chart palette); more parts fold into "Other"
const PALETTE = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];

type Share = { label: string; revenue: number; revenue_text: string; orders: number };

function fold(items: Share[], currency: string): Share[] {
  if (items.length <= PALETTE.length) return items;
  const rest = items.slice(PALETTE.length - 1);
  const revenue = rest.reduce((s, i) => s + i.revenue, 0);
  return [
    ...items.slice(0, PALETTE.length - 1),
    {
      label: "Other",
      revenue,
      revenue_text: formatMoney(revenue, currency),
      orders: rest.reduce((s, i) => s + i.orders, 0),
    },
  ];
}

function change(pct: number | null, days: number) {
  if (pct === null) return `No sales in the ${days} days before`;
  return `${pct > 0 ? "▲ " : pct < 0 ? "▼ " : ""}${Math.abs(pct)}% vs the ${days} days before`;
}

function Section({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-line min-w-0 rounded-xl border p-4", className)}>
      <h2 className="text-fg text-sm font-semibold">{title}</h2>
      {hint && <p className="text-fg-subtle mb-3 text-xs">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function RevenueChart({ data, currency }: { data: Insights["series"]; currency: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Revenue by day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
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
          <YAxis
            tick={axis}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v: number) => formatMoney(v, currency).replace(/\.00$/, "")}
          />
          <Tooltip
            cursor={{ fill: "var(--hover)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Insights["series"][number] | undefined;
              if (!active || !row) return null;
              return (
                <div className="border-line bg-surface min-w-40 rounded-lg border px-3 py-2 text-xs shadow-lg">
                  <p className="text-fg-subtle mb-1">{longFmt.format(parseDay(row.date))}</p>
                  <p className="flex justify-between gap-4">
                    <span className="text-fg-subtle">Revenue</span>
                    <b className="text-fg tabular-nums">{formatMoney(row.revenue, currency)}</b>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span className="text-fg-subtle">Orders</span>
                    <b className="text-fg tabular-nums">{nf.format(row.orders)}</b>
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="revenue"
            name="Revenue"
            fill="var(--viz-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Parts of the revenue: a labelled bar each (identity by label, colour only supports it). */
function Shares({ items: all, currency }: { items: Share[]; currency: string }) {
  const items = fold(all, currency);
  const total = items.reduce((s, i) => s + i.revenue, 0);
  if (!items.length) return <p className="text-fg-subtle text-sm">No sales in this period.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i, n) => {
        const pct = total ? Math.round((100 * i.revenue) / total) : 0;
        return (
          <li key={i.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: PALETTE[n] }}
                  aria-hidden
                />
                <span className="truncate">{i.label}</span>
              </span>
              <span className="text-fg-subtle shrink-0 text-xs tabular-nums">
                <b className="text-fg text-sm">{i.revenue_text}</b> · {i.orders} order
                {i.orders === 1 ? "" : "s"} · {pct}%
              </span>
            </div>
            <div className="bg-hover h-2 overflow-hidden rounded-full">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[n] }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Funnel({ steps }: { steps: Insights["funnel"] }) {
  const first = steps[0]?.count ?? 0;
  if (!first)
    return <p className="text-fg-subtle text-sm">No WhatsApp carts or store checkouts in this period.</p>;
  return (
    <ol className="space-y-2.5" aria-label="Checkout funnel">
      {steps.map((s, i) => {
        const pct = Math.round((100 * s.count) / first);
        return (
          <li
            key={s.step}
            className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm"
          >
            <span className="text-fg-subtle truncate">{s.label}</span>
            <span className="bg-hover h-7 overflow-hidden rounded-md">
              <span
                className="block h-full rounded-md"
                style={{
                  width: `${Math.max(pct, s.count ? 2 : 0)}%`,
                  background: `color-mix(in oklab, var(--viz-1) ${100 - i * 20}%, var(--surface))`,
                }}
              />
            </span>
            <span className="text-fg text-right tabular-nums">
              <b>{nf.format(s.count)}</b> <span className="text-fg-subtle text-xs">{i ? `${pct}%` : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Table<T>({
  rows,
  columns,
  empty,
  label,
}: {
  rows: T[];
  columns: { header: string; cell: (r: T) => React.ReactNode; align?: "right" }[];
  empty: string;
  label: string;
}) {
  if (!rows.length) return <p className="text-fg-subtle text-sm">{empty}</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm" aria-label={label}>
        <thead>
          <tr className="text-fg-subtle text-left text-xs">
            {columns.map((c) => (
              <th key={c.header} className={cn("px-1 pb-2 font-medium", c.align === "right" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cn("text-fg px-1 py-2 tabular-nums", c.align === "right" && "text-right")}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Commerce → Insights: sales over time, where they come from, and what brings them in. */
export function InsightsTab() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data, error, isLoading } = useQuery({
    queryKey: STORES_QK.INSIGHTS(days),
    queryFn: async () => (await storesApi.insights(days)).data,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={days === p}
              onClick={() => setDays(p)}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-medium transition",
                days === p
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-fg-subtle hover:border-line-strong hover:text-fg"
              )}
            >
              {p} days
            </button>
          ))}
        </div>
        <p className="text-fg-faint text-xs">Confirmed orders, not cancelled.</p>
      </div>
      {error && <ErrorBanner message={errorMessage(error)} />}
      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <>
          <KpiGrid cols={4}>
            <KpiTile
              icon={data.currency === "INR" ? IndianRupee : Banknote}
              tone="green"
              label="Revenue"
              value={data.kpis.revenue_text}
              hint={change(data.kpis.revenue_change, data.days)}
            />
            <KpiTile
              icon={Receipt}
              tone="blue"
              label="Orders"
              value={data.kpis.orders}
              hint={`${data.kpis.items_sold} items · ${change(data.kpis.orders_change, data.days)}`}
            />
            <KpiTile
              icon={ShoppingBag}
              tone="purple"
              label="Average order"
              value={data.kpis.aov_text ?? "—"}
              hint={data.kpis.aov_text ? change(data.kpis.aov_change, data.days) : "No orders yet"}
            />
            <KpiTile
              icon={Users}
              tone="slate"
              label="Customers"
              value={data.kpis.customers}
              hint={`${data.kpis.returning} came back · ${data.kpis.recovered_text} from cart reminders`}
            />
          </KpiGrid>

          {data.kpis.orders === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No sales in this period"
              description="When orders are confirmed (from WhatsApp, your team, a chatbot or your online store), the numbers show up here."
            />
          ) : (
            <>
              <Section title="Revenue by day" hint={`${data.kpis.revenue_text} in ${data.days} days`}>
                <RevenueChart data={data.series} currency={data.currency} />
              </Section>
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Where sales come from">
                  <Shares items={data.by_source} currency={data.currency} />
                </Section>
                <Section title="How customers pay" hint={`Refunded: ${data.kpis.refunded_text}`}>
                  <Shares items={data.by_payment} currency={data.currency} />
                </Section>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Section
                  title="Checkout funnel"
                  hint="WhatsApp carts and store checkouts started in this period"
                >
                  <Funnel steps={data.funnel} />
                </Section>
                <Section title="Top products">
                  <Table
                    label="Top products"
                    rows={data.top_products}
                    empty="No products sold."
                    columns={[
                      { header: "Product", cell: (p) => <span className="block truncate">{p.name}</span> },
                      { header: "Sold", cell: (p) => nf.format(p.quantity), align: "right" },
                      { header: "Revenue", cell: (p) => <b>{p.revenue_text}</b>, align: "right" },
                    ]}
                  />
                </Section>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Section
                  title="Revenue from campaigns"
                  hint={`${data.kpis.campaign_revenue_text}: orders within 7 days of the customer getting a campaign`}
                >
                  <Table
                    label="Campaigns"
                    rows={data.campaigns}
                    empty="No orders came after a campaign in this period."
                    columns={[
                      {
                        header: "Campaign",
                        cell: (c) => (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Megaphone className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{c.name}</span>
                          </span>
                        ),
                      },
                      { header: "Sent", cell: (c) => nf.format(c.sent), align: "right" },
                      { header: "Orders", cell: (c) => nf.format(c.orders), align: "right" },
                      {
                        header: "Converted",
                        cell: (c) => (c.conversion === null ? "—" : `${c.conversion}%`),
                        align: "right",
                      },
                      { header: "Revenue", cell: (c) => <b>{c.revenue_text}</b>, align: "right" },
                    ]}
                  />
                </Section>
                <Section title="Revenue from chatbots" hint="Orders within 24 hours of chatting with a bot">
                  <Table
                    label="Chatbots"
                    rows={data.chatbots}
                    empty="No orders came after a chatbot in this period."
                    columns={[
                      {
                        header: "Chatbot",
                        cell: (c) => (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Bot className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{c.name}</span>
                          </span>
                        ),
                      },
                      { header: "Orders", cell: (c) => nf.format(c.orders), align: "right" },
                      { header: "Revenue", cell: (c) => <b>{c.revenue_text}</b>, align: "right" },
                    ]}
                  />
                </Section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
