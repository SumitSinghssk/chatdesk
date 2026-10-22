"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import {
  AccessDenied,
  Avatar,
  Button,
  Card,
  EmptyState,
  Pagination,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { activityLogsApi, type ActivityLog } from "@/app/admin/_lib/api/activityLogsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo, titleCase } from "@/lib/utils";

import { ActionBadge } from "@/app/admin/_components/activity";
import { ActivityKpis, type ActivityKpi } from "./ActivityKpis";
import { ActivityLogModal } from "./ActivityLogModal";
import { ActivityCard, ActivityListItem, SubjectText, actorName } from "./ActivityViews";

import { QK } from "@/config/query-keys";
const muted = <span className="text-fg-faint">—</span>;
const DEVICE_OPTIONS = ["desktop", "mobile", "tablet", "bot"].map((d) => ({ value: d, label: titleCase(d) }));

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

export default function ActivityLogs() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["action", "user_id", "subject_type", "date_from", "date_to"] });
  const grid = useGridUrlState();
  const [viewing, setViewing] = useState<ActivityLog | null>(null);

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.ACTIVITY_LOGS, params],
    queryFn: ({ signal }) => activityLogsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.ACTIVITY_LOGS, "stats"], queryFn: activityLogsApi.stats });

  if (!can(PERM.ACTIVITY_LOGS_VIEW)) return <AccessDenied />;

  const clearAll = async () => {
    const ok = await confirm({
      title: "Clear the activity log?",
      message: "Every activity entry will be permanently deleted. This can't be undone.",
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    try {
      const res = await activityLogsApi.clear();
      toast.success(res.message ?? "Cleared");
      await queryClient.invalidateQueries({ queryKey: [QK.ACTIVITY_LOGS] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't clear the activity log"));
    }
  };

  const only = grid.filters.length === 1 && !list.hasFilters ? grid.filters[0] : null;
  const onlyValue = Array.isArray(only?.value) && only.value.length === 1 ? only.value[0] : null;
  const activeKpi: ActivityKpi | null =
    only?.field === "created_at" && only.op === "on"
      ? "today"
      : only?.field === "created_at" && only.op === "between"
        ? "week"
        : only?.field === "action" && only.op === "in" && onlyValue
          ? onlyValue === "login" || onlyValue === "login_failed"
            ? onlyValue
            : { action: onlyValue }
          : null;

  const selectKpi = (kpi: ActivityKpi) => {
    const today = new Date();
    const todayYmd = toYmd(today);
    const weekStartYmd = toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
    const reset = {
      action: null,
      user_id: null,
      subject_type: null,
      date_from: null,
      date_to: null,
      search: null,
    };
    if (kpi === "today") grid.setFiltersWith([rule("created_at", "on", todayYmd)], reset);
    else if (kpi === "week")
      grid.setFiltersWith([rule("created_at", "between", [weekStartYmd, todayYmd])], reset);
    else {
      const action = typeof kpi === "string" ? kpi : kpi.action;
      grid.setFiltersWith([rule("action", "in", [action])], reset);
    }
  };

  const columns: GridColumn<ActivityLog>[] = [
    {
      id: "user",
      header: "User",
      type: "enum",
      size: 220,
      alwaysVisible: true,
      options: (stats?.users ?? []).map((u) => ({ value: String(u.id), label: u.name })),
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={actorName(row)} size={24} />
          <span className="min-w-0">
            <span className="text-fg block truncate font-medium">{actorName(row)}</span>
            {row.user && <span className="text-fg-subtle block truncate text-xs">{row.user.email}</span>}
          </span>
        </span>
      ),
    },
    {
      id: "action",
      header: "Action",
      type: "enum",
      size: 140,
      options: (stats?.actions ?? []).map((a) => ({ value: a, label: titleCase(a) })),
      cell: (row) => <ActionBadge action={row.action} />,
    },
    {
      id: "subject_label",
      header: "Subject",
      type: "text",
      size: 300,
      cell: (row) => (
        <span className="block min-w-0">
          <SubjectText row={row} />
        </span>
      ),
    },
    {
      id: "subject_type",
      header: "Subject type",
      type: "enum",
      size: 140,
      defaultHidden: true,
      options: (stats?.subject_types ?? []).map((t) => ({ value: t, label: titleCase(t) })),
      cell: (row) => (row.subject_type ? titleCase(row.subject_type) : muted),
    },
    {
      id: "subject_id",
      header: "Subject ID",
      type: "number",
      size: 100,
      align: "right",
      defaultHidden: true,
      cell: (row) => row.subject_id ?? muted,
    },
    {
      id: "description",
      header: "Description",
      type: "text",
      size: 260,
      defaultHidden: true,
      cell: (row) => row.description || muted,
    },
    {
      id: "user_email",
      header: "Email",
      type: "text",
      size: 200,
      defaultHidden: true,
      cell: (row) => row.user_email || muted,
    },
    {
      id: "ip_address",
      header: "IP",
      type: "text",
      size: 130,
      cell: (row) => (row.ip_address ? <span className="font-mono text-xs">{row.ip_address}</span> : muted),
    },
    {
      id: "browser",
      header: "Browser",
      type: "text",
      size: 150,
      cell: (row) => row.browser || muted,
    },
    {
      id: "platform",
      header: "Platform",
      type: "text",
      size: 140,
      defaultHidden: true,
      cell: (row) => row.platform || muted,
    },
    {
      id: "device",
      header: "Device",
      type: "enum",
      size: 110,
      defaultHidden: true,
      options: DEVICE_OPTIONS,
      cell: (row) => (row.device ? titleCase(row.device) : muted),
    },
    {
      id: "created_at",
      header: "Time",
      type: "date",
      size: 130,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.created_at)}
        </span>
      ),
    },
  ];

  const filtered = list.hasFilters || grid.filters.length > 0;

  return (
    <>
      <h1 className="sr-only">Activity logs</h1>
      <ActivityKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="activity-logs"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search user, subject, IP…"
          count={data?.meta?.total}
          countLabel={data?.meta?.total === 1 ? "event" : "events"}
          actions={
            can(PERM.ACTIVITY_LOGS_CLEAR) &&
            !!stats?.total && (
              <Tooltip label="Clear the activity log" align="end">
                <Button
                  variant="danger-outline"
                  iconOnly
                  leftIcon={Trash2}
                  aria-label="Clear the activity log"
                  onClick={clearAll}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          onRowClick={setViewing}
          highlightId={viewing?.id}
          renderListItem={(row, slots) => <ActivityListItem row={row} slots={slots} />}
          renderCard={(row, slots) => <ActivityCard row={row} slots={slots} />}
          empty={
            <EmptyState
              icon={Activity}
              title={filtered ? "No activity matches your filters" : "No activity recorded yet"}
              description={filtered ? "Try a different search or filter." : undefined}
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="entries"
            />
          }
        />
      </Card>

      <ActivityLogModal log={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
