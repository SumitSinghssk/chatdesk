"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileStack, HardDrive, RefreshCw, ScrollText, Trash2, XOctagon } from "lucide-react";
import { toast } from "sonner";

import {
  DataGrid,
  KpiGrid,
  KpiTile,
  useGridUrlState,
  type FilterRule,
  type GridColumn,
} from "@/app/admin/_components/grid";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { logsApi, type LogFile } from "@/app/admin/_lib/api/logsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { cn, formatBytes, formatDate, formatDateTime, timeAgo } from "@/lib/utils";

import { filterRows, sortRows, type ClientField } from "./clientGrid";
import { LogCard, LogListItem } from "./LogViews";
import { LogViewer } from "./LogViewer";

import { QK } from "@/config/query-keys";
const FIELDS: Record<string, ClientField<LogFile>> = {
  name: { type: "text", get: (f) => f.name },
  date: { type: "date", get: (f) => f.date },
  size: { type: "number", get: (f) => f.size },
  modified_at: { type: "date", get: (f) => f.modified_at },
  errors: { type: "number", get: (f) => f.errors },
  warnings: { type: "number", get: (f) => f.warnings },
};

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

export default function Logs() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const list = useUrlListState({ filterKeys: [], defaultPerPage: 20 });
  const grid = useGridUrlState();
  const selection = useBulkSelection();

  const canView = can(PERM.LOGS_VIEW);
  const files = useQuery({ queryKey: [QK.LOGS], queryFn: logsApi.list, enabled: canView });
  const { data: stats } = useQuery({
    queryKey: [QK.LOGS, "stats"],
    queryFn: logsApi.stats,
    enabled: canView,
  });

  const openFile = searchParams.get("file");
  const lines = Number(searchParams.get("lines")) || 500;
  const setParams = (changes: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const idOf = useMemo(() => new Map((files.data ?? []).map((f, i) => [f.name, i + 1])), [files.data]);
  const visible = useMemo(() => {
    const term = list.search.trim().toLowerCase();
    const searched = term
      ? (files.data ?? []).filter((f) => f.name.toLowerCase().includes(term))
      : (files.data ?? []);
    return sortRows(filterRows(searched, FIELDS, grid.filters, grid.match), FIELDS, grid.sort);
  }, [files.data, list.search, grid.filters, grid.match, grid.sort]);

  if (!canView) return <AccessDenied />;
  const canDelete = can(PERM.LOGS_DELETE);

  const total = visible.length;
  const totalPages = Math.max(1, Math.ceil(total / list.perPage));
  const page = Math.min(list.page, totalPages);
  const rows = visible.slice((page - 1) * list.perPage, page * list.perPage);
  const meta = { page, per_page: list.perPage, total, total_pages: total ? totalPages : 0 };
  const filtered = !!list.search || grid.filters.length > 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.LOGS] });

  const removeFile = async (name: string) => {
    const ok = await confirm({
      title: "Delete log file?",
      message: (
        <>
          <b>{name}</b> will be permanently deleted.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await logsApi.remove(name);
      toast.success(res.message ?? "Deleted");
      if (openFile === name) setParams({ file: null });
      selection.clear();
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete log file"));
    }
  };

  const removeSelected = async () => {
    const names = (files.data ?? [])
      .filter((f) => selection.isSelected(idOf.get(f.name) ?? 0))
      .map((f) => f.name);
    const ok = await confirm({
      title: `Delete ${names.length} log file(s)?`,
      message: "The selected log files will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const results = await Promise.allSettled(names.map((n) => logsApi.remove(n)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} file(s) couldn't be deleted`);
    if (names.length - failed) toast.success(`${names.length - failed} log file(s) deleted`);
    if (openFile && names.includes(openFile)) setParams({ file: null });
    selection.clear();
    await refresh();
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: "Delete all log files?",
      message: "Every application log file will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete all",
    });
    if (!ok) return;
    try {
      const res = await logsApi.clear();
      toast.success(res.message ?? "Deleted");
      setParams({ file: null });
      selection.clear();
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete log files"));
    }
  };

  const open = (name: string) => setParams({ file: name });
  const openToday = () => {
    const today = toYmd(new Date());
    const file = files.data?.find((f) => f.date === today);
    if (file) open(file.name);
    else grid.setFiltersWith([rule("date", "on", today)], { search: null });
  };

  const columns: GridColumn<LogFile>[] = [
    {
      id: "name",
      header: "File",
      type: "text",
      size: 230,
      alwaysVisible: true,
      cell: (f) => (
        <span className="flex min-w-0 items-center gap-2">
          <ScrollText
            className={cn("h-4 w-4 shrink-0", f.name === openFile ? "text-primary" : "text-fg-subtle")}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => open(f.name)}
            className={cn(
              "hover:text-primary truncate font-medium",
              f.name === openFile ? "text-primary" : "text-fg"
            )}
          >
            {f.name}
          </button>
        </span>
      ),
    },
    {
      id: "date",
      header: "Day",
      type: "date",
      size: 130,
      cell: (f) => (f.date ? formatDate(f.date) : <span className="text-fg-faint">—</span>),
    },
    {
      id: "errors",
      header: "Errors",
      type: "number",
      size: 100,
      align: "right",
      cell: (f) =>
        f.errors === null || f.errors === undefined ? (
          <span className="text-fg-faint" title="Too big to scan">
            —
          </span>
        ) : (
          <span className={f.errors ? "text-danger font-semibold" : "text-fg-faint"}>{f.errors}</span>
        ),
    },
    {
      id: "warnings",
      header: "Warnings",
      type: "number",
      size: 110,
      align: "right",
      cell: (f) =>
        f.warnings === null || f.warnings === undefined ? (
          <span className="text-fg-faint" title="Too big to scan">
            —
          </span>
        ) : (
          <span className={f.warnings ? "text-warning font-semibold" : "text-fg-faint"}>{f.warnings}</span>
        ),
    },
    {
      id: "size",
      header: "Size",
      type: "number",
      size: 110,
      align: "right",
      cell: (f) => formatBytes(f.size),
    },
    {
      id: "modified_at",
      header: "Last written",
      type: "date",
      size: 150,
      cell: (f) => (
        <span title={formatDateTime(f.modified_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(f.modified_at)}
        </span>
      ),
    },
    ...(canDelete
      ? [
          {
            id: "actions",
            header: "",
            sortable: false,
            size: 70,
            align: "right" as const,
            cell: (f: LogFile) => (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                leftIcon={Trash2}
                aria-label={`Delete ${f.name}`}
                title="Delete"
                className="hover:bg-danger-soft hover:text-danger"
                onClick={() => removeFile(f.name)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <h1 className="sr-only">Application logs</h1>
      <KpiGrid cols={4}>
        <KpiTile
          icon={FileStack}
          label="Log files"
          value={stats?.files}
          hint={stats?.latest_at ? `Last written ${timeAgo(stats.latest_at)}` : "Nothing logged yet"}
          onClick={() => {
            list.setSearchInput("");
            grid.setFiltersWith([], { search: null, sort: null });
          }}
        />
        <KpiTile
          icon={HardDrive}
          tone="blue"
          label="Disk used"
          value={stats && formatBytes(stats.total_size)}
          hint="storage/logs"
          onClick={() => grid.setSort([{ id: "size", desc: true }])}
        />
        <KpiTile
          icon={XOctagon}
          tone={stats?.errors_today ? "red" : "slate"}
          label="Errors today"
          value={stats?.errors_today ?? (stats ? "—" : undefined)}
          hint={stats && `${stats.warnings_today ?? "—"} warning(s)`}
          title="Open today's log"
          onClick={openToday}
        />
        <KpiTile
          icon={AlertTriangle}
          tone={stats?.errors_total ? "amber" : "slate"}
          label="Files with errors"
          value={files.data?.filter((f) => !!f.errors).length}
          hint={stats && `${stats.errors_total} error(s) in total`}
          onClick={() => grid.setFiltersWith([rule("errors", "gt", "0")], { sort: "-errors" })}
        />
      </KpiGrid>

      <Card>
        <DataGrid
          id="logs"
          columns={columns}
          rows={files.data ? rows : undefined}
          getRowId={(f) => idOf.get(f.name) ?? 0}
          loading={files.isLoading}
          fetching={files.isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search file names…"
          count={files.data ? total : undefined}
          countLabel={total === 1 ? "log file" : "log files"}
          actions={
            <>
              <Tooltip label="Refresh">
                <Button
                  iconOnly
                  variant="secondary"
                  leftIcon={RefreshCw}
                  aria-label="Refresh"
                  loading={files.isFetching}
                  onClick={refresh}
                  className="h-9 w-9"
                />
              </Tooltip>
              {canDelete && !!files.data?.length && (
                <Tooltip label="Delete all log files" align="end">
                  <Button
                    iconOnly
                    variant="danger-outline"
                    leftIcon={Trash2}
                    aria-label="Delete all log files"
                    onClick={clearAll}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canDelete ? selection : undefined}
          onRowClick={(f) => open(f.name)}
          highlightId={openFile ? (idOf.get(openFile) ?? null) : null}
          renderListItem={(f, slots) => (
            <LogListItem
              file={f}
              slots={slots}
              active={f.name === openFile}
              onOpen={open}
              onDelete={canDelete ? removeFile : undefined}
            />
          )}
          renderCard={(f, slots) => (
            <LogCard file={f} slots={slots} onOpen={open} onDelete={canDelete ? removeFile : undefined} />
          )}
          empty={
            files.isError ? (
              <EmptyState title="Couldn't load log files" description={apiErrorMessage(files.error)} />
            ) : (
              <EmptyState
                icon={ScrollText}
                title={filtered ? "No log files match" : "No log files"}
                description={filtered ? "Try another search or filter." : "Nothing has been logged yet."}
              />
            )
          }
          footer={
            <Pagination
              meta={meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="files"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={removeSelected}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <LogViewer
        name={openFile && idOf.has(openFile) ? openFile : null}
        lines={lines}
        onLines={(n) => setParams({ lines: n === 500 ? null : String(n) })}
        onClose={() => setParams({ file: null, lines: null })}
        onDelete={canDelete ? removeFile : undefined}
      />
    </>
  );
}
