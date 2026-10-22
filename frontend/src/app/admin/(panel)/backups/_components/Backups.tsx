"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  Skeleton,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { backupsApi, type Backup } from "@/app/admin/_lib/api/backupsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatBytes, formatDateTime } from "@/lib/utils";

import { BackupKpis, type BackupKpiAction } from "./BackupKpis";
import { BackupNowModal } from "./BackupNowModal";
import { BackupStatusCell } from "./BackupStatusCell";
import {
  BackupButtons,
  BackupCard,
  BackupListItem,
  ContentsBadges,
  TriggerBadge,
  formatDuration,
  type BackupRowActions,
} from "./BackupViews";
import { ScheduleCard } from "./ScheduleCard";
import { SchedulerHelp } from "./SchedulerHelp";

import { QK } from "@/config/query-keys";
const muted = <span className="text-fg-faint">—</span>;
const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

export default function Backups() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: [], defaultPerPage: 15 });
  const grid = useGridUrlState();
  const selection = useBulkSelection();
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const canView = can(PERM.BACKUPS_VIEW);

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.BACKUPS, "list", params],
    queryFn: ({ signal }) => backupsApi.page(params, signal),
    placeholderData: (prev) => prev,
    enabled: canView,
  });
  const { data: stats, dataUpdatedAt: statsAt } = useQuery({
    queryKey: [QK.BACKUPS, "stats"],
    queryFn: backupsApi.stats,
    enabled: canView,
  });
  const { data: schedule } = useQuery({
    queryKey: [QK.BACKUPS, "settings"],
    queryFn: backupsApi.settings,
    enabled: canView,
  });

  if (!canView) return <AccessDenied />;

  const canCreate = can(PERM.BACKUPS_CREATE);
  const canDownload = can(PERM.BACKUPS_DOWNLOAD);
  const canDelete = can(PERM.BACKUPS_DELETE);
  const running = !!(data?.summary.running_id ?? stats?.running_id);
  const filtered = !!list.search || grid.filters.length > 0;
  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.BACKUPS] });

  async function download(backup: Backup, file: string) {
    setDownloading(`${backup.id}/${file}`);
    try {
      await backupsApi.download(backup, file);
    } catch (err) {
      toast.error(apiErrorMessage(err, "The download failed."));
    } finally {
      setDownloading(null);
    }
  }

  async function remove(backup: Backup) {
    const ok = await confirm({
      title: "Delete this backup?",
      message: `${backup.name} and its files will be removed from the server. This can't be undone.`,
      confirmLabel: "Delete backup",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await backupsApi.remove(backup.id);
      toast.success(res.message ?? "Backup deleted");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function removeSelected() {
    const ok = await confirm({
      title: `Delete ${selection.count} backup(s)?`,
      message:
        "The selected backups and their files will be removed from the server. Running backups are skipped.",
      confirmLabel: "Delete backups",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await backupsApi.bulkDelete(selection.ids);
      toast.success(res.message ?? "Backups deleted");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const showSchedule = () =>
    document.getElementById("backup-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const selectKpi = (action: BackupKpiAction) => {
    if (action === "schedule") return showSchedule();
    selection.clear();
    list.setSearchInput("");
    if (action === "completed")
      grid.setFiltersWith([rule("status", "in", ["completed"])], { search: null, sort: "-finished_at" });
    else if (action === "size")
      grid.setFiltersWith([rule("status", "in", ["completed"])], { search: null, sort: "-size" });
    else {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
      grid.setFiltersWith(
        [rule("status", "in", ["failed"]), rule("started_at", "between", [toYmd(from), toYmd(today)])],
        { search: null, sort: null }
      );
    }
  };

  const rowActions: BackupRowActions = {
    canDownload,
    canDelete,
    downloading,
    onDownload: download,
    onDelete: remove,
  };

  const columns: GridColumn<Backup>[] = [
    {
      id: "name",
      header: "Backup",
      type: "text",
      size: 230,
      alwaysVisible: true,
      cell: (row) => <span className="text-fg font-semibold">{row.name}</span>,
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 200,
      alwaysVisible: true,
      options: [
        { value: "running", label: "Running" },
        { value: "completed", label: "Completed" },
        { value: "failed", label: "Failed" },
      ],
      cell: (row) => (
        <div className="py-0.5 whitespace-normal">
          <BackupStatusCell backup={row} />
        </div>
      ),
    },
    {
      id: "trigger",
      header: "Trigger",
      type: "enum",
      size: 130,
      options: [
        { value: "manual", label: "Manual" },
        { value: "scheduled", label: "Scheduled" },
      ],
      cell: (row) => <TriggerBadge trigger={row.trigger} />,
    },
    {
      id: "contents",
      header: "Contains",
      sortable: false,
      size: 180,
      cell: (row) => <ContentsBadges row={row} />,
    },
    {
      id: "includes_database",
      header: "Database",
      type: "bool",
      size: 110,
      defaultHidden: true,
      cell: (row) => (row.includes_database ? "Yes" : "No"),
    },
    {
      id: "includes_files",
      header: "Files",
      type: "bool",
      size: 100,
      defaultHidden: true,
      cell: (row) => (row.includes_files ? "Yes" : "No"),
    },
    {
      id: "size",
      header: "Size",
      type: "number",
      size: 110,
      align: "right",
      cell: (row) => (row.status === "completed" ? formatBytes(row.size) : muted),
    },
    {
      id: "started_at",
      header: "Started",
      type: "date",
      size: 170,
      cell: (row) => (
        <span className="whitespace-nowrap">{formatDateTime(row.started_at ?? row.created_at)}</span>
      ),
    },
    {
      id: "finished_at",
      header: "Finished",
      type: "date",
      size: 170,
      defaultHidden: true,
      cell: (row) => (row.finished_at ? formatDateTime(row.finished_at) : muted),
    },
    {
      id: "duration",
      header: "Took",
      sortable: false,
      size: 100,
      align: "right",
      defaultHidden: true,
      cell: (row) => (row.duration_seconds !== null ? formatDuration(row.duration_seconds) : muted),
    },
    {
      id: "user",
      header: "By",
      type: "text",
      size: 150,
      cell: (row) => row.user?.name ?? <span className="text-fg-faint">Scheduler</span>,
    },
    {
      id: "error",
      header: "Error",
      type: "text",
      sortable: false,
      size: 260,
      defaultHidden: true,
      cell: (row) =>
        row.error ? (
          <span className="text-danger" title={row.error}>
            {row.error}
          </span>
        ) : (
          muted
        ),
    },
    ...(canDownload || canDelete
      ? [
          {
            id: "actions",
            header: "Downloads",
            sortable: false,
            size: 200,
            align: "right" as const,
            cell: (row: Backup) => <BackupButtons row={row} actions={rowActions} />,
          },
        ]
      : []),
  ];

  return (
    <>
      <h1 className="sr-only">Backups</h1>
      <BackupKpis stats={stats} checkedAt={statsAt} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="backups"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search backups…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "backup" : "backups"}
          actions={
            <>
              <Tooltip label="Backup schedule">
                <Button
                  iconOnly
                  variant="secondary"
                  leftIcon={Settings2}
                  aria-label="Backup schedule"
                  onClick={showSchedule}
                  className="h-9 w-9"
                />
              </Tooltip>
              {canCreate && (
                <Tooltip label={running ? "A backup is running" : "Back up now"} align="end">
                  <Button
                    iconOnly
                    leftIcon={Save}
                    aria-label="Back up now"
                    disabled={running}
                    onClick={() => setCreating(true)}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canDelete ? selection : undefined}
          renderListItem={(row, slots) => <BackupListItem row={row} slots={slots} actions={rowActions} />}
          renderCard={(row, slots) => <BackupCard row={row} slots={slots} actions={rowActions} />}
          empty={
            <EmptyState
              icon={Save}
              title={filtered ? "No backups match" : "No backups yet"}
              description={
                filtered
                  ? "Try another search or filter."
                  : "Make your first backup now, and turn on automatic backups so you always have a recent copy."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="backups"
            />
          }
        />
        {data && (
          <p className="text-fg-subtle border-line border-t px-4 py-2.5 text-xs">
            {formatBytes(data.summary.total_size)} in completed backups. Stored in storage/backups (never
            public).
          </p>
        )}
      </Card>

      <div id="backup-schedule" className="mt-6 grid scroll-mt-4 gap-6 xl:grid-cols-2">
        {schedule ? (
          <>
            <ScheduleCard
              key={JSON.stringify(schedule.settings)}
              schedule={schedule}
              canEdit={can(PERM.BACKUPS_SETTINGS)}
            />
            <SchedulerHelp schedule={schedule} />
          </>
        ) : (
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-full" />
          </Card>
        )}
      </div>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={removeSelected}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      {canCreate && (
        <BackupNowModal
          open={creating}
          onClose={() => setCreating(false)}
          onStarted={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
