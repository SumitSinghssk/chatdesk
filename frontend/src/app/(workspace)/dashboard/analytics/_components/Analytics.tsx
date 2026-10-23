"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Download,
  Inbox,
  MessageCircle,
  MessageSquareReply,
  Send,
  Timer,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { KpiGrid, KpiTile, type KpiTone } from "@/app/admin/_components/grid";
import {
  Badge,
  Button,
  Card,
  CardBody,
  DateRangePicker,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { cn } from "@/lib/utils";

import { CardHeader } from "../../_components/CardHeader";
import {
  ANALYTICS_QK,
  analyticsApi,
  type AnalyticsReport,
  type Kpis,
  type RangeQuery,
} from "../../_lib/analyticsApi";
import { duration } from "../../_lib/teamApi";
import { Segmented } from "../../templates/_components/editor/parts";
import { DayBars, Funnel, Heatmap, nf, parseDay, ShareBars, TrendChart } from "./Charts";

const PRESETS = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "custom", label: "Custom" },
] as const;
type Preset = (typeof PRESETS)[number]["value"];

const shortFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const span = (a: string, b: string) =>
  a === b ? fullFmt.format(parseDay(a)) : `${shortFmt.format(parseDay(a))} – ${fullFmt.format(parseDay(b))}`;

/** Change against the previous period. `lowerIsBetter` turns a drop green (e.g. response time). */
function Trend({
  now,
  before,
  lowerIsBetter,
  suffix,
}: {
  now: number | null;
  before: number | null;
  lowerIsBetter?: boolean;
  suffix?: ReactNode;
}) {
  const change = now !== null && before ? Math.round(((now - before) / before) * 100) : null;
  const good = change !== null && (lowerIsBetter ? change <= 0 : change >= 0);
  const note = before === 0 && now ? "new" : !now && !before ? "same as before" : "";
  return (
    <span className="inline-flex items-center gap-1">
      {change !== null ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-medium",
            good ? "text-success" : "text-danger"
          )}
        >
          {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(change)}%
        </span>
      ) : (
        <span>{note}</span>
      )}
      {suffix && (
        <span>
          {change !== null || note ? "· " : ""}
          {suffix}
        </span>
      )}
    </span>
  );
}

function Section({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader title={title} description={description} icon={icon} actions={actions} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-fg-subtle py-6 text-center text-sm">{children}</p>;
}

function NowChip({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      className="border-line bg-surface hover:border-line-strong flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-xs transition"
    >
      <span className={cn("text-fg text-sm font-semibold tabular-nums", tone)}>{nf.format(value)}</span>
      <span className="text-fg-subtle">{label}</span>
    </Link>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

function exportCsv(r: AnalyticsReport) {
  const k = r.kpis;
  const lines = [
    [`ChatDesk analytics ${r.period.start} to ${r.period.end} (${r.period.timezone})`],
    [],
    ["Measure", "This period", "Previous period"],
    ...(
      [
        ["Messages received", "received"],
        ["Messages sent", "sent"],
        ["Delivered", "delivered"],
        ["Read", "read"],
        ["Failed", "failed"],
        ["New chats", "new_chats"],
        ["Resolved", "resolved"],
        ["New contacts", "new_contacts"],
        ["Opted out", "opted_out"],
        ["Average first response (seconds)", "avg_response_seconds"],
        ["Campaign messages", "campaign_messages"],
        ["Chatbot chats", "bot_chats"],
        ["Automatic replies", "auto_replies"],
      ] as [string, keyof Kpis][]
    ).map(([label, key]) => [label, String(k[key] ?? ""), String(r.previous[key] ?? "")]),
    [],
    ["Date", "Received", "Sent", "New chats", "Resolved", "New contacts"],
    ...r.daily.map((d) => [d.date, d.received, d.sent, d.new_chats, d.resolved, d.new_contacts].map(String)),
  ];
  const csv = lines
    .map((row) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `chatdesk-analytics-${r.period.start}-to-${r.period.end}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Analytics() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const start = params.get("start");
  const end = params.get("end");
  const preset: Preset = start && end ? "custom" : ((params.get("range") as Preset) ?? "30");
  const query: RangeQuery =
    start && end ? { start, end } : { days: Number(preset === "custom" ? 30 : preset) || 30 };
  const setParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const report = useQuery({
    queryKey: ANALYTICS_QK.REPORT(query),
    queryFn: async () => (await analyticsApi.report(query)).data,
    placeholderData: keepPreviousData,
  });
  const r = report.data;

  const tiles = useMemo(() => {
    if (!r) return [];
    const k = r.kpis;
    const p = r.previous;
    const list: { icon: LucideIcon; tone: KpiTone; label: string; value: ReactNode; hint: ReactNode }[] = [
      {
        icon: MessageCircle,
        tone: "blue",
        label: "Messages received",
        value: nf.format(k.received),
        hint: <Trend now={k.received} before={p.received} />,
      },
      {
        icon: Send,
        tone: "green",
        label: "Messages sent",
        value: nf.format(k.sent),
        hint: <Trend now={k.sent} before={p.sent} suffix={k.failed ? `${k.failed} failed` : undefined} />,
      },
      {
        icon: CheckCircle2,
        tone: "purple",
        label: "Read rate",
        value: k.read_rate === null ? "—" : `${k.read_rate}%`,
        hint: (
          <Trend
            now={k.read_rate}
            before={p.read_rate}
            suffix={k.delivery_rate === null ? undefined : `${k.delivery_rate}% delivered`}
          />
        ),
      },
      {
        icon: Inbox,
        tone: "indigo",
        label: "New chats",
        value: nf.format(k.new_chats),
        hint: <Trend now={k.new_chats} before={p.new_chats} suffix={`${nf.format(k.resolved)} resolved`} />,
      },
      {
        icon: Timer,
        tone: "amber",
        label: "First response",
        value: k.avg_response_seconds === null ? "—" : duration(k.avg_response_seconds),
        hint: (
          <Trend
            now={k.avg_response_seconds}
            before={p.avg_response_seconds}
            lowerIsBetter
            suffix={k.within_5_min === null ? undefined : `${k.within_5_min}% in 5 min`}
          />
        ),
      },
      {
        icon: UserPlus,
        tone: "green",
        label: "New contacts",
        value: nf.format(k.new_contacts),
        hint: <Trend now={k.new_contacts} before={p.new_contacts} />,
      },
      {
        icon: Bot,
        tone: "blue",
        label: "Chatbot chats",
        value: nf.format(k.bot_chats),
        hint: (
          <Trend
            now={k.bot_chats}
            before={p.bot_chats}
            suffix={k.bot_chats ? `${pct(k.bot_completed, k.bot_chats)} finished` : undefined}
          />
        ),
      },
      {
        icon: UserMinus,
        tone: "red",
        label: "Opted out",
        value: nf.format(k.opted_out),
        hint: <Trend now={k.opted_out} before={p.opted_out} lowerIsBetter />,
      },
    ];
    return list;
  }, [r]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Analytics"
        icon={BarChart3}
        description="How your WhatsApp is doing: messages, chats, your team, campaigns and automation."
        actions={
          <Button
            variant="secondary"
            leftIcon={Download}
            disabled={!r}
            onClick={() => r && exportCsv(r)}
            aria-label="Export CSV"
          >
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full min-w-0">
          <Segmented<Preset>
            label="Period"
            value={preset}
            onChange={(v) =>
              v === "custom"
                ? setParams({
                    range: null,
                    start: r?.period.start ?? null,
                    end: r?.period.end ?? null,
                  })
                : setParams({ range: v, start: null, end: null })
            }
            options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
        {preset === "custom" && (
          <DateRangePicker
            aria-label="Custom period"
            value={{ from: start ?? "", to: end ?? "" }}
            onChange={(v) => v.from && v.to && setParams({ range: null, start: v.from, end: v.to })}
            max={new Date().toISOString().slice(0, 10)}
            wrapperClassName="w-64"
          />
        )}
        {r && (
          <p className="text-fg-subtle text-xs" aria-live="polite">
            <b className="text-fg">{span(r.period.start, r.period.end)}</b> · compared with{" "}
            {span(r.period.previous.start, r.period.previous.end)}
            {report.isFetching && " · updating…"}
          </p>
        )}
      </div>

      {report.isError && <ErrorBanner message={errorMessage(report.error)} />}

      {!r ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" aria-label="Right now">
            <span className="text-fg-faint text-xs font-semibold tracking-wide uppercase">Right now</span>
            <NowChip href={CUSTOMER_ROUTES.INBOX()} label="open chats" value={r.now.open} />
            <NowChip
              href={CUSTOMER_ROUTES.INBOX()}
              label="waiting for a reply"
              value={r.now.waiting}
              tone={r.now.waiting ? "text-warning" : undefined}
            />
            <NowChip href={CUSTOMER_ROUTES.INBOX()} label="unassigned" value={r.now.unassigned} />
            <NowChip href={CUSTOMER_ROUTES.INBOX()} label="pending" value={r.now.pending} />
            <NowChip href={CUSTOMER_ROUTES.CHATBOTS()} label="chatbots talking" value={r.now.bots_talking} />
            <NowChip href={CUSTOMER_ROUTES.CONTACTS()} label="contacts" value={r.now.contacts} />
          </div>

          <KpiGrid cols={4}>
            {tiles.map((t) => (
              <KpiTile
                key={t.label}
                icon={t.icon}
                tone={t.tone}
                label={t.label}
                value={t.value}
                hint={t.hint}
              />
            ))}
          </KpiGrid>

          <div className="grid gap-4 xl:grid-cols-3">
            <Section
              title="Messages"
              icon={MessageCircle}
              description="Received from customers and sent by you, per day"
              className="xl:col-span-2"
            >
              <TrendChart
                data={r.daily}
                label="Line chart of messages received and sent per day"
                series={[
                  { key: "received", label: "Received", color: "var(--viz-1)" },
                  { key: "sent", label: "Sent", color: "var(--viz-2)" },
                ]}
              />
            </Section>
            <Section
              title="Who sent your messages"
              icon={Send}
              description="Everything that went out in this period"
            >
              {r.kpis.sent === 0 ? (
                <Empty>Nothing was sent in this period.</Empty>
              ) : (
                <div className="space-y-6">
                  <ShareBars
                    items={[
                      { label: "Your team", value: r.sources.team, color: "var(--viz-1)" },
                      { label: "Campaigns", value: r.sources.campaigns, color: "var(--viz-2)" },
                      { label: "Automatic replies", value: r.sources.automation, color: "var(--viz-3)" },
                      { label: "Chatbots", value: r.sources.chatbots, color: "var(--viz-4)" },
                    ]}
                  />
                  <div>
                    <p className="text-fg mb-2 text-sm font-semibold">Delivery</p>
                    <Funnel
                      steps={[
                        { label: "Sent", value: r.kpis.sent - r.kpis.failed },
                        { label: "Delivered", value: r.kpis.delivered },
                        { label: "Read", value: r.kpis.read },
                      ]}
                    />
                  </div>
                </div>
              )}
            </Section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Chats" icon={Inbox} description="New chats and chats resolved, per day">
              <DayBars
                data={r.daily}
                label="Bar chart of new and resolved chats per day"
                series={[
                  { key: "new_chats", label: "New chats", color: "var(--viz-1)" },
                  { key: "resolved", label: "Resolved", color: "var(--viz-2)" },
                ]}
              />
            </Section>
            <Section
              title="When customers write"
              icon={Timer}
              description="Plan your team's hours around the busy times"
            >
              <Heatmap grid={r.heatmap} timezone={r.period.timezone} />
            </Section>
          </div>

          <Section
            title="Team"
            icon={MessageSquareReply}
            description="Replies, response times and resolved chats per person"
          >
            {r.team.length === 0 ? (
              <Empty>No team members yet.</Empty>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[640px] text-sm" aria-label="Team performance">
                  <thead>
                    <tr className="text-fg-subtle border-line border-b text-left text-xs">
                      <th className="px-4 py-2 font-medium sm:pl-0">Person</th>
                      <th className="px-3 py-2 text-right font-medium">Replies</th>
                      <th className="px-3 py-2 text-right font-medium">First response</th>
                      <th className="px-3 py-2 text-right font-medium">Within 5 min</th>
                      <th className="px-3 py-2 text-right font-medium">Resolved</th>
                      <th className="px-4 py-2 text-right font-medium sm:pr-0">Open now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-line divide-y">
                    {r.team.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-2.5 sm:pl-0">
                          <span className="text-fg font-medium">{m.name}</span>{" "}
                          <span className="text-fg-faint text-xs capitalize">{m.role}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(m.replies)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {m.avg_response_seconds === null ? "—" : duration(m.avg_response_seconds)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {m.within_5_min === null ? "—" : `${m.within_5_min}%`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(m.resolved)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums sm:pr-0">
                          {nf.format(m.open_chats)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section
              title="Campaigns"
              icon={Send}
              description="Started in this period · cost is Meta's rough price for delivered messages"
              actions={
                <Link
                  href={CUSTOMER_ROUTES.CAMPAIGNS()}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  All campaigns
                </Link>
              }
            >
              {r.campaigns.length === 0 ? (
                <Empty>No campaigns were sent in this period.</Empty>
              ) : (
                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <table className="w-full min-w-[520px] text-sm" aria-label="Campaign results">
                    <thead>
                      <tr className="text-fg-subtle border-line border-b text-left text-xs">
                        <th className="px-4 py-2 font-medium sm:pl-0">Campaign</th>
                        <th className="px-3 py-2 text-right font-medium">Sent</th>
                        <th className="px-3 py-2 text-right font-medium">Read</th>
                        <th className="px-3 py-2 text-right font-medium">Replied</th>
                        <th className="px-4 py-2 text-right font-medium sm:pr-0">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-line divide-y">
                      {r.campaigns.map((c) => (
                        <tr key={c.id}>
                          <td className="max-w-48 px-4 py-2.5 sm:pl-0">
                            <Link
                              href={CUSTOMER_ROUTES.CAMPAIGN(c.id)}
                              className="text-fg hover:text-primary block truncate font-medium"
                            >
                              {c.name}
                            </Link>
                            <span className="text-fg-faint text-xs">
                              {shortFmt.format(new Date(c.started_at))}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{nf.format(c.sent)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.read, c.sent)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.replied, c.sent)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums sm:pr-0">
                            ₹{c.cost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section
              title="Automation"
              icon={Zap}
              description={`${nf.format(r.kpis.auto_replies)} automatic replies · ${nf.format(r.kpis.bot_chats)} chatbot chats`}
            >
              {r.chatbots.length === 0 && r.auto_replies.length === 0 ? (
                <Empty>No chatbots or automatic replies answered in this period.</Empty>
              ) : (
                <div className="space-y-5">
                  {r.chatbots.length > 0 && (
                    <ul className="divide-line divide-y" aria-label="Chatbots">
                      {r.chatbots.map((b) => (
                        <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                          <Bot className="text-fg-faint h-4 w-4 shrink-0" />
                          <Link
                            href={CUSTOMER_ROUTES.CHATBOT(b.id)}
                            className="text-fg hover:text-primary min-w-0 flex-1 truncate font-medium"
                          >
                            {b.name}
                          </Link>
                          {!b.active && <Badge tone="neutral">Off</Badge>}
                          <span className="text-fg-subtle shrink-0 text-xs tabular-nums">
                            <b className="text-fg">{nf.format(b.started)}</b> chats ·{" "}
                            {b.completion_rate === null ? "—" : `${b.completion_rate}%`} finished ·{" "}
                            {nf.format(b.handover)} handed over
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.auto_replies.length > 0 && (
                    <div>
                      <p className="text-fg mb-2 text-sm font-semibold">Most-sent automatic replies</p>
                      <ShareBars
                        items={r.auto_replies.slice(0, 5).map((a) => ({
                          label: a.name,
                          value: a.sent,
                          color: "var(--viz-3)",
                          hint: a.trigger === "keyword" ? "keyword" : a.trigger,
                        }))}
                      />
                    </div>
                  )}
                </div>
              )}
            </Section>
          </div>

          <Section
            title="Contacts"
            icon={UserPlus}
            description={`New contacts per day · ${nf.format(r.kpis.opted_out)} opted out`}
          >
            <DayBars
              data={r.daily}
              label="Bar chart of new contacts per day"
              series={[{ key: "new_contacts", label: "New contacts", color: "var(--viz-1)" }]}
            />
          </Section>

          <details className="border-line bg-surface rounded-xl border px-4 py-3">
            <summary className="text-fg cursor-pointer text-sm font-semibold select-none">
              Day-by-day numbers
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm" aria-label="Day-by-day numbers">
                <thead>
                  <tr className="text-fg-subtle border-line border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Day</th>
                    {["Received", "Sent", "New chats", "Resolved", "New contacts"].map((h) => (
                      <th key={h} className="px-3 py-2 text-right font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {[...r.daily].reverse().map((d) => (
                    <tr key={d.date}>
                      <td className="py-2 pr-3">{fullFmt.format(parseDay(d.date))}</td>
                      {[d.received, d.sent, d.new_chats, d.resolved, d.new_contacts].map((v, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums">
                          {nf.format(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {r.kpis.received === 0 && r.kpis.sent === 0 && (
            <EmptyState
              icon={BarChart3}
              title="Nothing in this period yet"
              description="Pick a longer period, or come back once customers have written in."
              className="py-6"
            />
          )}
        </>
      )}
    </div>
  );
}
