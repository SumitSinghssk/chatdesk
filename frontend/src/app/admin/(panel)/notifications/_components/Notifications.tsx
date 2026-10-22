"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, MailOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  Tabs,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import {
  notificationsApi,
  type AppNotification,
  type NotificationBulkAction,
} from "@/app/admin/_lib/api/notificationsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { NotificationKpis, type NotificationKpiAction } from "./NotificationKpis";
import {
  NotificationButtons,
  NotificationCard,
  NotificationListItem,
  TypeIcon,
  typeMeta,
  type NotificationRowActions,
} from "./NotificationViews";

import { QK } from "@/config/query-keys";
type Tab = "all" | "unread";

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

export default function Notifications() {
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["tab"], defaultPerPage: 15 });
  const grid = useGridUrlState();
  const selection = useBulkSelection();
  const tab: Tab = list.filters.tab === "unread" ? "unread" : "all";

  const { tab: _tab, ...listParams } = list.params;
  const params = { ...listParams, unread: tab === "unread", ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.NOTIFICATIONS, "page", params],
    queryFn: ({ signal }) => notificationsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: [QK.NOTIFICATIONS, "stats"],
    queryFn: notificationsApi.stats,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.NOTIFICATIONS] });

  const run = async (fn: () => Promise<{ message?: string }>, fallback: string, silent = false) => {
    try {
      const res = await fn();
      if (!silent) toast.success(res.message ?? "Done");
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, fallback));
    }
  };

  const open = async (n: AppNotification) => {
    if (!n.read_at) await run(() => notificationsApi.markRead(n.id), "Couldn't mark as read", true);
    if (n.url) router.push(n.url);
  };

  const bulk = async (action: NotificationBulkAction) => {
    if (action === "delete") {
      const ok = await confirm({
        title: `Delete ${selection.count} notification(s)?`,
        message: "The selected notifications will be removed. This can't be undone.",
        confirmLabel: "Delete",
      });
      if (!ok) return;
    }
    await run(() => notificationsApi.bulk(selection.ids, action), "Bulk action failed");
    selection.clear();
  };

  const rowActions: NotificationRowActions = {
    onOpen: open,
    onToggleRead: (n) =>
      n.read_at
        ? run(() => notificationsApi.markUnread(n.id), "Couldn't mark as unread")
        : run(() => notificationsApi.markRead(n.id), "Couldn't mark as read"),
    onDelete: (n) => run(() => notificationsApi.remove(n.id), "Couldn't delete notification"),
  };

  const selectKpi = (action: NotificationKpiAction) => {
    selection.clear();
    list.setSearchInput("");
    const reset = { search: null, tab: null };
    const today = new Date();
    if (action === "unread") grid.setFiltersWith([], { ...reset, tab: "unread" });
    else if (action === "today") grid.setFiltersWith([rule("created_at", "on", toYmd(today))], reset);
    else if (action === "week") {
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      grid.setFiltersWith([rule("created_at", "between", [toYmd(from), toYmd(today)])], reset);
    } else grid.setFiltersWith([rule("type", "in", [action.type])], reset);
  };

  const unread = data?.unread ?? stats?.unread ?? 0;
  const filtered = !!list.search || grid.filters.length > 0;

  const columns: GridColumn<AppNotification>[] = [
    {
      id: "title",
      header: "Notification",
      type: "text",
      size: 300,
      alwaysVisible: true,
      cell: (n) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <TypeIcon n={n} size={26} />
          <span
            aria-label={n.read_at ? undefined : "Unread"}
            className={cn("h-2 w-2 shrink-0 rounded-full", n.read_at ? "hidden" : "bg-primary")}
          />
          <span className={cn("text-fg truncate", n.read_at ? "font-medium" : "font-bold")}>{n.title}</span>
        </span>
      ),
    },
    {
      id: "message",
      header: "Message",
      type: "text",
      sortable: false,
      size: 320,
      cell: (n) => (
        <span className="text-fg-subtle" title={n.message ?? undefined}>
          {n.message || <span className="text-fg-faint">—</span>}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      type: "enum",
      size: 160,
      options: (stats?.by_type ?? []).map((t, i) => ({ value: t.type, label: typeMeta(t.type, i).label })),
      cell: (n) => typeMeta(n.type).label,
    },
    {
      id: "created_at",
      header: "Received",
      type: "date",
      size: 130,
      cell: (n) => (
        <span title={formatDateTime(n.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(n.created_at)}
        </span>
      ),
    },
    {
      id: "read",
      header: "Read",
      type: "bool",
      sortable: false,
      size: 90,
      defaultHidden: true,
      cell: (n) => (n.read_at ? "Yes" : <span className="text-primary font-medium">No</span>),
    },
    {
      id: "read_at",
      header: "Read at",
      type: "date",
      size: 160,
      defaultHidden: true,
      cell: (n) => (n.read_at ? formatDateTime(n.read_at) : <span className="text-fg-faint">—</span>),
    },
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      size: 130,
      align: "right",
      cell: (n) => <NotificationButtons n={n} actions={rowActions} />,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Notifications</h1>
      <NotificationKpis stats={stats} onSelect={selectKpi} />

      <Card>
        <Tabs<Tab>
          className="px-3 pt-1"
          value={tab}
          onChange={(v) => {
            selection.clear();
            list.setFilter("tab", v === "all" ? "" : v);
          }}
          tabs={[
            { value: "all", label: "All", count: stats?.total },
            { value: "unread", label: "Unread", count: unread },
          ]}
        />
        <DataGrid
          id="notifications"
          columns={columns}
          rows={data?.items}
          getRowId={(n) => n.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search notifications…"
          count={data?.meta?.total}
          countLabel={data?.meta?.total === 1 ? "notification" : "notifications"}
          actions={
            unread > 0 && (
              <Tooltip label="Mark all as read" align="end">
                <Button
                  iconOnly
                  variant="secondary"
                  leftIcon={CheckCheck}
                  aria-label="Mark all as read"
                  onClick={() => run(notificationsApi.markAllRead, "Couldn't mark all as read")}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={selection}
          onRowClick={open}
          renderListItem={(n, slots) => <NotificationListItem n={n} slots={slots} actions={rowActions} />}
          renderCard={(n, slots) => <NotificationCard n={n} slots={slots} actions={rowActions} />}
          defaultView="list"
          empty={
            <EmptyState
              icon={Bell}
              title={
                filtered
                  ? "No notifications match"
                  : tab === "unread"
                    ? "You're all caught up"
                    : "No notifications yet"
              }
              description={
                filtered
                  ? "Try another search or filter."
                  : tab === "unread"
                    ? "There are no unread notifications."
                    : "We'll let you know when something needs your attention."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="notifications"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button size="sm" variant="secondary" leftIcon={Check} onClick={() => bulk("read")}>
          Mark read
        </Button>
        <Button size="sm" variant="secondary" leftIcon={MailOpen} onClick={() => bulk("unread")}>
          Mark unread
        </Button>
        <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => bulk("delete")}>
          Delete
        </Button>
      </BulkActionBar>
    </>
  );
}
