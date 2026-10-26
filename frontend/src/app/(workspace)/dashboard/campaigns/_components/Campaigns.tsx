"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  Copy,
  Eye,
  Hourglass,
  Megaphone,
  MessageCircle,
  Plus,
  SendHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { DataGrid, KpiGrid, KpiTile, useGridUrlState, type GridColumn } from "@/app/admin/_components/grid";
import { Badge, Button, Card, EmptyState, Pagination, RowActions } from "@/app/admin/_components/ui/index";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { Tooltip } from "../../_components/Tooltip";
import { CAMPAIGNS_QK, campaignsApi, type Campaign } from "../../_lib/campaignsApi";
import { CAMPAIGN_STATUS, pct, waitText } from "./labels";

const GRID_ID = "ws-campaigns";
const muted = <span className="text-fg-faint">—</span>;

type Kpi = "all" | "scheduled" | "active" | "completed" | "draft";
const KPI_STATUS: Record<Kpi, string> = {
  all: "",
  scheduled: "scheduled,waiting",
  active: "sending,paused",
  completed: "completed",
  draft: "draft",
};

function Rate({ value, of, label }: { value: number; of: number; label: string }) {
  return (
    <span className="block min-w-0">
      <span className="tabular text-fg block text-sm font-medium">{of ? `${pct(value, of)}%` : "—"}</span>
      <span className="text-fg-faint block text-[11px]">
        {value} {label}
      </span>
    </span>
  );
}

export function Campaigns() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useUrlListState({ filterKeys: ["status"] });
  const grid = useGridUrlState();

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: CAMPAIGNS_QK.LIST(params),
    queryFn: ({ signal }) => campaignsApi.page(params, signal),
    placeholderData: (prev) => prev,
    // live numbers while something is sending
    refetchInterval: (q) =>
      q.state.data?.items.some((c) => ["sending", "scheduled"].includes(c.status)) ? 5_000 : 30_000,
  });
  const { data: stats } = useQuery({
    queryKey: CAMPAIGNS_QK.STATS,
    queryFn: async () => (await campaignsApi.stats()).data,
    refetchInterval: 15_000,
  });

  const remove = async (c: Campaign) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: "The report is deleted. Messages already sent stay in each chat.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await campaignsApi.remove(c.id);
      toast.success(res.message ?? "Campaign deleted");
      void queryClient.invalidateQueries({ queryKey: CAMPAIGNS_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const activeKpi = list.search
    ? null
    : ((Object.keys(KPI_STATUS) as Kpi[]).find((k) => KPI_STATUS[k] === (list.filters.status ?? "")) ?? null);
  const selectKpi = (k: Kpi) => list.setFilter("status", KPI_STATUS[k]);
  const open = (c: Campaign) =>
    router.push(c.status === "draft" ? CUSTOMER_ROUTES.CAMPAIGN_EDIT(c.id) : CUSTOMER_ROUTES.CAMPAIGN(c.id));

  const statusCell = (c: Campaign) => {
    const s = CAMPAIGN_STATUS[c.status];
    const done = c.report.sent + c.report.failed;
    return (
      <span className="block">
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
        {c.status === "sending" && c.total > 0 && (
          <span className="bg-hover mt-1.5 block h-1 w-24 overflow-hidden rounded-full">
            <span className="bg-primary block h-full" style={{ width: `${pct(done, c.total)}%` }} />
          </span>
        )}
      </span>
    );
  };

  const rowActions = (c: Campaign) => (
    <RowActions onDelete={["sending", "paused"].includes(c.status) ? undefined : () => remove(c)}>
      <Tooltip label="Duplicate">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={Copy}
          aria-label={`Duplicate ${c.name}`}
          onClick={() => router.push(CUSTOMER_ROUTES.CAMPAIGN_NEW({ from: c.id }))}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
      <Tooltip label={c.status === "draft" ? "Continue editing" : "View report"}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={c.status === "draft" ? Megaphone : BarChart3}
          aria-label={`Open ${c.name}`}
          onClick={() => open(c)}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
    </RowActions>
  );

  const when = (c: Campaign) => c.started_at ?? c.scheduled_at ?? c.created_at;

  const columns: GridColumn<Campaign>[] = [
    {
      id: "name",
      header: "Campaign",
      type: "text",
      size: 280,
      alwaysVisible: true,
      cell: (c) => (
        <span className="block min-w-0">
          <span className="text-fg block truncate font-medium">{c.name}</span>
          <span className="text-fg-subtle block truncate font-mono text-xs">{c.template_name}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 140,
      options: Object.entries(CAMPAIGN_STATUS).map(([value, s]) => ({ value, label: s.label })),
      cell: statusCell,
    },
    {
      id: "total",
      header: "Recipients",
      type: "number",
      size: 110,
      cell: (c) => (c.total || c.report.recipients ? <span className="tabular">{c.total}</span> : muted),
    },
    {
      id: "delivered",
      header: "Delivered",
      sortable: false,
      size: 110,
      cell: (c) => <Rate value={c.report.delivered} of={c.report.sent} label="people" />,
    },
    {
      id: "read",
      header: "Read",
      sortable: false,
      size: 100,
      cell: (c) => <Rate value={c.report.read} of={c.report.sent} label="people" />,
    },
    {
      id: "replied",
      header: "Replied",
      sortable: false,
      size: 100,
      cell: (c) => <Rate value={c.report.replied} of={c.report.sent} label="people" />,
    },
    {
      id: "failed",
      header: "Failed",
      sortable: false,
      size: 90,
      defaultHidden: true,
      cell: (c) => (c.report.failed ? <span className="text-danger tabular">{c.report.failed}</span> : muted),
    },
    {
      id: "started_at",
      header: "Sent / scheduled",
      type: "date",
      size: 160,
      cell: (c) => (
        <span
          title={formatDateTime(when(c))}
          className="text-fg-subtle flex items-center gap-1 whitespace-nowrap"
        >
          {c.status === "scheduled" && <CalendarClock className="h-3.5 w-3.5" />}
          {c.status === "waiting" && <Hourglass className="h-3.5 w-3.5" />}
          {c.status === "waiting"
            ? `${waitText(c.follow_up_hours)} after the first one`
            : c.status === "scheduled" && c.scheduled_at
              ? formatDateTime(c.scheduled_at)
              : timeAgo(when(c))}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      size: 130,
      minSize: 130,
      alwaysVisible: true,
      align: "right",
      cell: rowActions,
    },
  ];

  const filtered = list.hasFilters || grid.filters.length > 0;
  const sent = stats?.all_sent ?? 0;

  return (
    <>
      <h1 className="sr-only">Campaigns</h1>

      <KpiGrid cols={5}>
        <KpiTile
          icon={Megaphone}
          tone="green"
          label="Campaigns"
          value={stats?.total}
          hint={stats ? `${stats.completed} completed · ${stats.draft} drafts` : undefined}
          active={activeKpi === "all"}
          onClick={() => selectKpi("all")}
        />
        <KpiTile
          icon={CalendarClock}
          tone={stats?.scheduled ? "blue" : "slate"}
          label="Scheduled"
          value={stats?.scheduled}
          hint={stats?.active ? `${stats.active} sending now` : "Waiting to go out"}
          active={activeKpi === "scheduled"}
          onClick={() => selectKpi("scheduled")}
        />
        <KpiTile
          icon={SendHorizontal}
          tone="purple"
          label="Messages sent"
          value={sent}
          hint={`${stats?.sent_today ?? 0} today`}
        />
        <KpiTile
          icon={Eye}
          tone="amber"
          label="Read rate"
          value={sent ? `${pct(stats?.all_read ?? 0, sent)}%` : "—"}
          hint={sent ? `${pct(stats?.all_delivered ?? 0, sent)}% delivered` : "Across all campaigns"}
        />
        <KpiTile
          icon={MessageCircle}
          tone="blue"
          label="Reply rate"
          value={sent ? `${pct(stats?.all_replied ?? 0, sent)}%` : "—"}
          hint={stats?.all_clicked ? `${stats.all_clicked} button taps` : "People who wrote back"}
        />
      </KpiGrid>

      <Card>
        <DataGrid
          id={GRID_ID}
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search campaign or template"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "campaign" : "campaigns"}
          actions={
            <Tooltip label="New campaign" align="end">
              <Button
                iconOnly
                leftIcon={Plus}
                aria-label="New campaign"
                onClick={() => router.push(CUSTOMER_ROUTES.CAMPAIGN_NEW())}
                className="h-9 w-9"
              />
            </Tooltip>
          }
          onRowClick={open}
          renderListItem={(c) => (
            <div className="flex items-center gap-3">
              <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <Megaphone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate font-semibold">{c.name}</p>
                <p className="text-fg-subtle truncate text-xs">
                  {c.report.sent
                    ? `${c.report.sent} sent · ${pct(c.report.read, c.report.sent)}% read`
                    : c.template_name}
                </p>
              </div>
              <span className="shrink-0">{statusCell(c)}</span>
              <span className="shrink-0">{rowActions(c)}</span>
            </div>
          )}
          renderCard={(c) => (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-fg min-w-0 truncate font-semibold">{c.name}</p>
                {statusCell(c)}
              </div>
              <p className="text-fg-subtle mt-1 truncate font-mono text-xs">{c.template_name}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Rate value={c.report.delivered} of={c.report.sent} label="delivered" />
                <Rate value={c.report.read} of={c.report.sent} label="read" />
                <Rate value={c.report.replied} of={c.report.sent} label="replied" />
              </div>
              <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-fg-subtle text-xs">{timeAgo(when(c))}</span>
                {rowActions(c)}
              </div>
            </>
          )}
          empty={
            <EmptyState
              icon={Megaphone}
              title={filtered ? "No campaigns match" : "No campaigns yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Send an approved template to all your contacts, a tag, or people from an earlier campaign. Schedule it, see the cost first, and follow delivery, reads and replies live."
              }
              action={
                !filtered && (
                  <Button leftIcon={Plus} onClick={() => router.push(CUSTOMER_ROUTES.CAMPAIGN_NEW())}>
                    New campaign
                  </Button>
                )
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="campaigns"
            />
          }
        />
      </Card>
    </>
  );
}
