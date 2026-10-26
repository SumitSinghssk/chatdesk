"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCheck,
  Copy,
  Download,
  Eye,
  Hourglass,
  MessageCircle,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SendHorizontal,
  Target,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import {
  Badge,
  Button,
  Card,
  CardBody,
  DataTable,
  Dropdown,
  EmptyState,
  ErrorBanner,
  Input,
  Pagination,
  Spinner,
  Tabs,
  type Column,
} from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { CardHeader } from "../../_components/CardHeader";
import { ChatBackdrop, TemplateBubble } from "../../_components/whatsapp/TemplatePreview";
import {
  CAMPAIGNS_QK,
  campaignsApi,
  type Campaign,
  type CampaignBrief,
  type Recipient,
  type RecipientStatus,
} from "../../_lib/campaignsApi";
import { templatesApi } from "../../_lib/templatesApi";
import { previewValues } from "../../templates/_components/TemplateDetail";
import { CAMPAIGN_STATUS, pct, RECIPIENT_STATUS, SEGMENTS, segmentText, waitText } from "./labels";

const LIVE = new Set(["scheduled", "sending"]);

function audienceText(c: Campaign, names: Map<number, string>) {
  const a = c.audience;
  const exclude = a.exclude_tags?.length ? `, without ${a.exclude_tags.join(", ")}` : "";
  if (a.type === "tags")
    return `Contacts tagged ${a.tags.join(a.tag_match === "all" ? " + " : " or ")}${exclude}`;
  if (a.type === "contacts") return `${a.contact_ids.length} selected contacts`;
  if (a.type === "campaign") {
    const seg = SEGMENTS.find((s) => s.value === a.segment)?.label.toLowerCase() ?? "";
    return `People from “${names.get(a.campaign_id ?? 0) ?? "an earlier campaign"}” who ${seg}${exclude}`;
  }
  return `All contacts${exclude}`;
}

/** When a follow-up goes out, or how it went. */
function followUpWhen(f: CampaignBrief & { report: Campaign["report"] }) {
  if (f.status === "waiting") return `${waitText(f.follow_up_hours)} after this one finishes`;
  if (f.status === "scheduled" && f.scheduled_at) return `Goes out ${formatDateTime(f.scheduled_at)}`;
  if (f.status === "sending" || f.status === "paused")
    return `${CAMPAIGN_STATUS[f.status].label} · ${f.report.sent} sent`;
  if (f.status === "completed")
    return `Sent to ${f.report.sent} · ${pct(f.report.read, f.report.sent)}% read`;
  return CAMPAIGN_STATUS[f.status].label;
}

function Funnel({ c }: { c: Campaign }) {
  const r = c.report;
  const base = r.sent || 1;
  const steps = [
    { label: "Sent", value: r.sent, of: c.total || 1, color: "bg-sky-500" },
    { label: "Delivered", value: r.delivered, of: base, color: "bg-indigo-500" },
    { label: "Read", value: r.read, of: base, color: "bg-emerald-500" },
    { label: "Replied", value: r.replied, of: base, color: "bg-amber-500" },
  ];
  return (
    <div className="space-y-2.5">
      {steps.map((s) => (
        <div
          key={s.label}
          className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm"
        >
          <span className="text-fg-subtle">{s.label}</span>
          <span className="bg-hover h-2.5 overflow-hidden rounded-full">
            <span
              className={`block h-full rounded-full ${s.color} transition-all`}
              style={{ width: `${pct(s.value, s.of)}%` }}
            />
          </span>
          <span className="tabular text-fg text-right font-medium">
            {pct(s.value, s.of)}% <span className="text-fg-faint text-xs">({s.value})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function CampaignReport({ id }: { id: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"all" | RecipientStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useDebouncedValue(search, 300);

  const {
    data: c,
    error,
    isLoading,
  } = useQuery({
    queryKey: CAMPAIGNS_QK.ONE(id),
    queryFn: async () => (await campaignsApi.get(id)).data,
    // live while sending; read receipts keep arriving for a while after
    refetchInterval: (query) => (LIVE.has(query.state.data?.status ?? "") ? 3_000 : 20_000),
  });
  const params = { page, per_page: perPage, status: tab === "all" ? undefined : tab, search: q || undefined };
  const { data: recipients, isLoading: loadingRecipients } = useQuery({
    queryKey: CAMPAIGNS_QK.RECIPIENTS(id, params),
    queryFn: ({ signal }) => campaignsApi.recipients(id, params, signal),
    placeholderData: (prev) => prev,
    refetchInterval: LIVE.has(c?.status ?? "") || c?.status === "paused" ? 5_000 : 30_000,
  });
  const { data: earlier } = useQuery({
    queryKey: CAMPAIGNS_QK.LIST({ per_page: 100 }),
    queryFn: () => campaignsApi.page({ per_page: 100 }),
    enabled: c?.audience.type === "campaign",
  });
  // how many people are in each retargeting group (opted-out and blocked people left out)
  const { data: segments } = useQuery({
    queryKey: CAMPAIGNS_QK.SEGMENTS(id),
    queryFn: async () => (await campaignsApi.segments(id)).data,
    enabled: (c?.report.sent ?? 0) > 0,
    refetchInterval: LIVE.has(c?.status ?? "") ? 10_000 : 60_000,
  });

  if (isLoading) return <Spinner className="h-full" />;
  if (error || !c) return <ErrorBanner message={errorMessage(error ?? new Error("Campaign not found"))} />;

  const r = c.report;
  const status = CAMPAIGN_STATUS[c.status];
  const done = r.sent + r.failed;
  const toSend = Math.max(c.total, 1);
  const names = new Map((earlier?.items ?? []).map((x) => [x.id, x.name]));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: CAMPAIGNS_QK.ALL });

  const act = async (action: "pause" | "resume" | "cancel") => {
    if (action === "cancel") {
      const ok = await confirm({
        title: "Cancel this campaign?",
        message: "People who haven't received it yet won't get it. Messages already sent stay sent.",
        confirmLabel: "Cancel campaign",
        cancelLabel: "Keep it",
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const res = await campaignsApi.control(c.id, action);
      toast.success(res.message ?? "Done");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: "The report is deleted. Messages already sent stay in each chat.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await campaignsApi.remove(c.id);
      toast.success("Campaign deleted");
      refresh();
      router.push(CUSTOMER_ROUTES.CAMPAIGNS());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const show = (t: "all" | RecipientStatus) => {
    setTab(t);
    setPage(1);
  };

  const columns: Column<Recipient>[] = [
    {
      key: "contact",
      header: "Contact",
      cell: (x) => (
        <span className="block min-w-0">
          <span className="text-fg block truncate font-medium">{x.contact.name || x.contact.phone}</span>
          {x.contact.name && <span className="text-fg-subtle block text-xs">{x.contact.phone}</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (x) => (
        <span className="flex flex-wrap items-center gap-1">
          <Badge tone={RECIPIENT_STATUS[x.status]?.tone ?? "neutral"} dot>
            {RECIPIENT_STATUS[x.status]?.label ?? x.status}
          </Badge>
          {x.replied && <Badge tone="success">Replied</Badge>}
        </span>
      ),
    },
    {
      key: "times",
      header: "Timeline",
      hideOnMobile: true,
      cell: (x) =>
        x.error ? (
          <span className="text-danger line-clamp-2 text-xs">{x.error}</span>
        ) : (
          <span className="text-fg-subtle text-xs">
            {[
              x.sent_at && `Sent ${timeAgo(x.sent_at)}`,
              x.read_at
                ? `read ${timeAgo(x.read_at)}`
                : x.delivered_at && `delivered ${timeAgo(x.delivered_at)}`,
              x.replied_at && `replied ${timeAgo(x.replied_at)}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Waiting"}
          </span>
        ),
    },
    {
      key: "chat",
      header: "",
      className: "text-right",
      cell: (x) =>
        x.conversation_id ? (
          <Link
            href={CUSTOMER_ROUTES.INBOX({ c: x.conversation_id })}
            aria-label={`Open chat with ${x.contact.name || x.contact.phone}`}
          >
            <Button size="sm" variant="ghost" leftIcon={MessageCircle}>
              Chat
            </Button>
          </Link>
        ) : null,
    },
  ];

  const canRetarget = r.sent > 0;
  const canFollowUp = ["scheduled", "waiting", "sending", "paused", "completed"].includes(c.status);
  const hasButtons = !!c.template?.form.buttons.some((b) => b.type === "quick_reply");
  const followUps = c.follow_ups ?? [];
  const addFollowUp = () => router.push(CUSTOMER_ROUTES.CAMPAIGN_NEW({ retarget: c.id, follow_up: 1 }));
  const tabs: { value: "all" | RecipientStatus; label: string; count?: number }[] = [
    { value: "all", label: "All", count: r.recipients },
    { value: "read", label: "Read", count: r.read },
    { value: "delivered", label: "Delivered", count: r.delivered },
    { value: "replied", label: "Replied", count: r.replied },
    ...(r.clicked ? [{ value: "clicked" as const, label: "Clicked", count: r.clicked }] : []),
    { value: "failed", label: "Failed", count: r.failed },
    { value: "skipped", label: "Skipped", count: c.skipped },
    ...(r.pending ? [{ value: "pending" as const, label: "Waiting", count: r.pending }] : []),
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={CUSTOMER_ROUTES.CAMPAIGNS()}
          aria-label="Back to campaigns"
          className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-fg flex items-center gap-2 text-lg font-semibold">
            <span className="truncate">{c.name}</span>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </h1>
          <p className="text-fg-subtle truncate text-xs">
            <span className="font-mono">{c.template_name}</span>
            {c.started_at ? ` · started ${formatDateTime(c.started_at)}` : ""}
            {c.created_by ? ` · by ${c.created_by}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.status === "sending" && (
            <Button
              variant="secondary"
              leftIcon={Pause}
              loading={busy === "pause"}
              onClick={() => act("pause")}
            >
              Pause
            </Button>
          )}
          {c.status === "paused" && (
            <Button leftIcon={Play} loading={busy === "resume"} onClick={() => act("resume")}>
              Resume
            </Button>
          )}
          {["draft", "waiting", "scheduled"].includes(c.status) && (
            <Link href={CUSTOMER_ROUTES.CAMPAIGN_EDIT(c.id)}>
              <Button variant="secondary" leftIcon={Pencil}>
                Edit
              </Button>
            </Link>
          )}
          {(canRetarget || canFollowUp) && (
            <Dropdown
              align="right"
              width="w-72"
              trigger={() => <Button leftIcon={Target}>Retarget</Button>}
              items={[
                ...SEGMENTS.filter((s) => s.value !== "sent" && (!s.buttons || hasButtons)).map((s) => ({
                  label: (
                    <span className="flex items-center justify-between gap-3">
                      <span>{segmentText(s.value)}</span>
                      <span className="text-fg-faint tabular text-xs">{segments?.[s.value] ?? ""}</span>
                    </span>
                  ),
                  hidden: !canRetarget,
                  disabled: segments?.[s.value] === 0,
                  onClick: () =>
                    router.push(CUSTOMER_ROUTES.CAMPAIGN_NEW({ retarget: c.id, segment: s.value })),
                })),
                ...(canRetarget && canFollowUp ? ["divider" as const] : []),
                {
                  label: "Follow up automatically…",
                  icon: Hourglass,
                  hidden: !canFollowUp,
                  onClick: addFollowUp,
                },
              ]}
            />
          )}
          <Dropdown
            align="right"
            width="w-52"
            trigger={() => (
              <Button variant="secondary" aria-label="More actions">
                More
              </Button>
            )}
            items={[
              {
                label: "Duplicate",
                icon: Copy,
                onClick: () => router.push(CUSTOMER_ROUTES.CAMPAIGN_NEW({ from: c.id })),
              },
              {
                label: "Download report (CSV)",
                icon: Download,
                hidden: !r.recipients,
                onClick: () => {
                  window.location.href = campaignsApi.exportUrl(c.id);
                },
              },
              {
                label: "Cancel campaign",
                icon: Ban,
                danger: true,
                hidden: !["scheduled", "sending", "paused"].includes(c.status),
                onClick: () => act("cancel"),
              },
              {
                label: "Delete",
                icon: Trash2,
                danger: true,
                hidden: ["sending", "paused"].includes(c.status),
                onClick: remove,
              },
            ]}
          />
        </div>
      </div>

      {c.error && (
        <div className="border-danger/30 bg-danger-soft text-danger mb-4 flex gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{c.error}</p>
        </div>
      )}
      {c.status === "scheduled" && c.scheduled_at && (
        <div className="border-line bg-info-soft text-info mb-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <p>
            {new Date(c.scheduled_at) > new Date()
              ? `Sends ${formatDateTime(c.scheduled_at)} (${timeAgo(c.scheduled_at)}). You can edit or cancel it until then.`
              : "Starting now…"}
          </p>
        </div>
      )}
      {c.status === "waiting" && (
        <div className="border-line bg-info-soft text-info mb-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <Hourglass className="h-4 w-4 shrink-0" />
          <p>
            Waiting for “{c.follows?.name ?? "the first campaign"}” to finish sending. It goes out{" "}
            {waitText(c.follow_up_hours)} after that, to people who still match. You can edit or cancel it
            until then.
          </p>
        </div>
      )}
      {(c.status === "sending" || c.status === "paused") && (
        <Card className="mb-4">
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg font-medium">
                {c.status === "paused" ? "Paused" : "Sending"} · {done} of {c.total}
              </span>
              <span className="tabular text-fg-subtle">{pct(done, toSend)}%</span>
            </div>
            <div
              className="bg-hover h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={pct(done, toSend)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${pct(done, toSend)}%` }}
              />
            </div>
          </CardBody>
        </Card>
      )}

      <KpiGrid cols={6}>
        <KpiTile
          icon={Users}
          tone="slate"
          label="Recipients"
          value={c.total || r.recipients - c.skipped}
          hint={c.skipped ? `${c.skipped} skipped` : "Opted-out skipped"}
          onClick={() => show("all")}
          active={tab === "all"}
        />
        <KpiTile
          icon={SendHorizontal}
          tone="blue"
          label="Sent"
          value={r.sent}
          hint={`${pct(r.sent, c.total)}% of recipients`}
          onClick={() => show("all")}
        />
        <KpiTile
          icon={CheckCheck}
          tone="purple"
          label="Delivered"
          value={`${pct(r.delivered, r.sent)}%`}
          hint={`${r.delivered} people`}
          onClick={() => show("delivered")}
          active={tab === "delivered"}
        />
        <KpiTile
          icon={Eye}
          tone="green"
          label="Read"
          value={`${pct(r.read, r.sent)}%`}
          hint={`${r.read} people`}
          onClick={() => show("read")}
          active={tab === "read"}
        />
        <KpiTile
          icon={r.clicked ? MousePointerClick : MessageCircle}
          tone="amber"
          label="Replied"
          value={`${pct(r.replied, r.sent)}%`}
          hint={r.clicked ? `${r.clicked} tapped a button` : `${r.replied} people`}
          onClick={() => show("replied")}
          active={tab === "replied"}
        />
        <KpiTile
          icon={XCircle}
          tone={r.failed ? "red" : "slate"}
          label="Failed"
          value={r.failed}
          hint={r.failed ? "See why below" : "None"}
          onClick={() => show("failed")}
          active={tab === "failed"}
        />
      </KpiGrid>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Funnel"
              description="Delivered, read and replied are shares of the messages sent."
            />
            <CardBody>
              <Funnel c={c} />
            </CardBody>
          </Card>

          <Card>
            <div className="px-4 pt-3 sm:px-5">
              <Tabs tabs={tabs} value={tab} onChange={show} />
            </div>
            <div className="p-4 sm:px-5">
              <Input
                leftIcon={Search}
                placeholder="Search name or number"
                aria-label="Search recipients"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                wrapperClassName="max-w-sm"
              />
            </div>
            <DataTable
              columns={columns}
              rows={recipients?.items}
              getRowId={(x) => x.id}
              loading={loadingRecipients}
              empty={
                <EmptyState
                  icon={Users}
                  title={
                    ["draft", "waiting", "scheduled"].includes(c.status) ? "Not sent yet" : "Nobody here"
                  }
                  description={
                    ["draft", "waiting", "scheduled"].includes(c.status)
                      ? "Recipients appear when the campaign starts sending."
                      : "Try another tab or search."
                  }
                />
              }
            />
            <Pagination
              meta={recipients?.meta}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n);
                setPage(1);
              }}
              unit="recipients"
            />
          </Card>
        </div>

        <aside className="space-y-4">
          {c.follows && (
            <Card>
              <CardHeader title="Follow-up of" />
              <CardBody className="space-y-1">
                <Link
                  href={CUSTOMER_ROUTES.CAMPAIGN(c.follows.id)}
                  className="text-primary block truncate text-sm font-semibold hover:underline"
                >
                  {c.follows.name}
                </Link>
                <p className="text-fg-subtle text-xs">
                  {segmentText(c.audience.segment)}, {waitText(c.follow_up_hours)} after it finished sending.
                </p>
              </CardBody>
            </Card>
          )}
          {(followUps.length > 0 || canFollowUp) && (
            <Card>
              <CardHeader
                title="Follow-ups"
                description="Sent automatically after this campaign to people who didn't respond. Who gets one is decided when it goes out."
              />
              <CardBody className="space-y-2">
                {followUps.map((f) => (
                  <Link
                    key={f.id}
                    href={CUSTOMER_ROUTES.CAMPAIGN(f.id)}
                    className="border-line hover:bg-hover block rounded-lg border px-3 py-2.5 transition"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-fg min-w-0 truncate text-sm font-medium">{f.name}</span>
                      <Badge tone={CAMPAIGN_STATUS[f.status].tone} dot>
                        {CAMPAIGN_STATUS[f.status].label}
                      </Badge>
                    </span>
                    <span className="text-fg-subtle mt-0.5 block text-xs">
                      {segmentText(f.segment)} · {followUpWhen(f)}
                    </span>
                  </Link>
                ))}
                {followUps.length === 0 && (
                  <p className="text-fg-subtle text-sm">
                    Remind people who didn&apos;t reply, for example 2 days later. It goes out on its own.
                  </p>
                )}
                {canFollowUp && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={Plus}
                    className="w-full"
                    onClick={addFollowUp}
                  >
                    Add a follow-up
                  </Button>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Message" />
            <CardBody>
              {c.template ? (
                <ChatBackdrop className="flex justify-center">
                  <TemplateBubble
                    template={c.template.form}
                    values={previewValues(c.template)}
                    highlight={false}
                    media={
                      c.template.sample
                        ? {
                            url: templatesApi.sampleUrl(c.template.sample.path),
                            filename: c.template.sample.filename,
                          }
                        : null
                    }
                  />
                </ChatBackdrop>
              ) : (
                <p className="text-fg-subtle text-sm">The template was deleted.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-line divide-y text-sm">
                {[
                  ["Audience", audienceText(c, names)],
                  ["Template", c.template_name],
                  ["Category", c.template_category ?? "—"],
                  ["Created", formatDateTime(c.created_at)],
                  ...(c.scheduled_at ? [["Scheduled for", formatDateTime(c.scheduled_at)]] : []),
                  ...(c.completed_at ? [["Finished", formatDateTime(c.completed_at)]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2">
                    <dt className="text-fg-subtle shrink-0">{k}</dt>
                    <dd className="text-fg text-right break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
