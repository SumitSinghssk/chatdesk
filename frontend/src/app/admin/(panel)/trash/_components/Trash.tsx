"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  Skeleton,
  Tabs,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { trashApi, type TrashItem } from "@/app/admin/_lib/api/trashApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { TrashKpis, type TrashKpiAction } from "./TrashKpis";
import { TrashCard, TrashListItem, TrashRowButtons, type TrashRowActions } from "./TrashViews";

import { QK } from "@/config/query-keys";
const muted = <span className="text-fg-faint">—</span>;

export default function Trash() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["type"], defaultPerPage: 25 });
  const grid = useGridUrlState();
  const selection = useBulkSelection();

  const legacySort = grid.sort.length === 1 ? grid.sort[0]!.id : null;
  useEffect(() => {
    if (legacySort === "oldest") grid.setSort([{ id: "deleted_at", desc: false }]);
    else if (legacySort === "newest") grid.setSort([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacySort]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: [QK.TRASH, "summary"],
    queryFn: trashApi.summary,
  });
  const { data: stats } = useQuery({ queryKey: [QK.TRASH, "stats"], queryFn: trashApi.stats });
  const type = list.filters.type || summary?.find((t) => t.count > 0)?.type || summary?.[0]?.type || "";
  const { type: _type, ...listParams } = list.params;
  const params = { ...listParams, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.TRASH, type, params],
    queryFn: ({ signal }) => trashApi.page(type, params, signal),
    placeholderData: (prev) => prev,
    enabled: !!type,
  });

  if (!can(PERM.TRASH_VIEW)) return <AccessDenied />;

  const canRestore = can(PERM.TRASH_RESTORE);
  const canDelete = can(PERM.TRASH_DELETE);
  const current = summary?.find((t) => t.type === type);
  const noun = current?.label.toLowerCase() ?? "items";
  const filtered = !!list.search || grid.filters.length > 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.TRASH] });
  const refreshModule = () => queryClient.invalidateQueries({ queryKey: [type.replace(/_/g, "-")] });

  const restore = async (ids: number[]) => {
    try {
      const res = await trashApi.restore(type, ids);
      const { restored, skipped } = res.data;
      if (restored) toast.success(`${restored} item(s) restored`);
      if (skipped.length) {
        toast.warning(`${skipped.length} item(s) couldn't be restored`, {
          description: (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {skipped.slice(0, 5).map((s) => (
                <li key={s.id}>
                  {data?.items.find((i) => i.id === s.id)?.title ?? `#${s.id}`}: {s.reason}
                </li>
              ))}
              {skipped.length > 5 && <li>…and {skipped.length - 5} more</li>}
            </ul>
          ),
          duration: 10000,
        });
      }
      selection.clear();
      refresh();
      refreshModule();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't restore"));
    }
  };

  const destroy = async (ids: number[], label?: string) => {
    const ok = await confirm({
      title: label ? "Delete forever?" : `Delete ${ids.length} item(s) forever?`,
      message: label ? (
        <>
          <b>{label}</b> will be permanently deleted, including any uploaded files. This can&apos;t be undone.
        </>
      ) : (
        "Selected items will be permanently deleted, including any uploaded files. This can't be undone."
      ),
      confirmLabel: "Delete forever",
    });
    if (!ok) return;
    try {
      const res = await trashApi.deleteForever(type, ids);
      toast.success(res.message ?? "Deleted");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete"));
    }
  };

  const empty = async () => {
    const ok = await confirm({
      title: `Empty ${noun} trash?`,
      message: (
        <>
          All <b>{current?.count ?? 0}</b> {noun} in the trash will be permanently deleted. This can&apos;t be
          undone.
        </>
      ),
      confirmLabel: "Empty trash",
    });
    if (!ok) return;
    try {
      const res = await trashApi.empty(type);
      toast.success(res.message ?? "Trash emptied");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't empty trash"));
    }
  };

  const switchType = (next: string) => {
    selection.clear();
    list.setFilter("type", next);
  };

  const selectKpi = (action: TrashKpiAction) => {
    selection.clear();
    list.setSearchInput("");
    if (action === "all") grid.setFiltersWith([], { search: null, sort: null });
    else if (action === "oldest" && stats?.oldest)
      grid.setFiltersWith([], { search: null, type: stats.oldest.type, sort: "deleted_at" });
    else if (action === "stale" && stats) {
      const today = new Date();
      const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - stats.stale_days);
      const rule: FilterRule = { id: "deleted_at", field: "deleted_at", op: "before", value: toYmd(cutoff) };
      const here = stats.by_type.find((t) => t.type === type);
      const target = here?.stale ? type : (stats.by_type.find((t) => t.stale > 0)?.type ?? type);
      grid.setFiltersWith([rule], { search: null, type: target, sort: "deleted_at" });
    } else if (typeof action === "object")
      grid.setFiltersWith(grid.filters, { type: action.type }, grid.match);
  };

  const rowActions: TrashRowActions = {
    canRestore,
    canDelete,
    onRestore: (row) => restore([row.id]),
    onDelete: (row) => destroy([row.id], row.title),
  };

  const columns: GridColumn<TrashItem>[] = [
    {
      id: "title",
      header: "Item",
      type: "text",
      size: 260,
      alwaysVisible: true,
      cell: (row) => <span className="text-fg font-medium">{row.title}</span>,
    },
    {
      id: "subtitle",
      header: "Details",
      type: "text",
      size: 260,
      cell: (row) => row.subtitle || muted,
    },
    {
      id: "deleted_at",
      header: "Deleted",
      type: "date",
      size: 150,
      cell: (row) => (
        <span title={formatDateTime(row.deleted_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.deleted_at)}
        </span>
      ),
    },
    {
      id: "deleted_on",
      header: "Deleted on",
      sortable: false,
      size: 170,
      defaultHidden: true,
      cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.deleted_at)}</span>,
    },
    {
      id: "id",
      header: "ID",
      type: "number",
      size: 90,
      align: "right",
      defaultHidden: true,
      cell: (row) => <span className="text-fg-subtle font-mono text-xs">#{row.id}</span>,
    },
    ...(canRestore || canDelete
      ? [
          {
            id: "actions",
            header: "Actions",
            sortable: false,
            size: 150,
            align: "right" as const,
            cell: (row: TrashItem) => <TrashRowButtons row={row} actions={rowActions} compact />,
          },
        ]
      : []),
  ];

  return (
    <>
      <h1 className="sr-only">Trash</h1>
      <TrashKpis stats={stats} onSelect={selectKpi} />

      <Card>
        {summaryLoading ? (
          <div className="flex gap-3 px-4 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-24" />
            ))}
          </div>
        ) : (
          <Tabs
            className="px-3 pt-1"
            value={type}
            onChange={switchType}
            tabs={(summary ?? []).map((t) => ({ value: t.type, label: t.label, count: t.count }))}
          />
        )}
        <DataGrid
          id="trash"
          columns={columns}
          rows={type ? data?.items : []}
          getRowId={(r) => r.id}
          loading={summaryLoading || (isLoading && !!type)}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder={`Search ${noun}…`}
          count={data?.meta.total}
          countLabel={noun}
          actions={
            canDelete &&
            !!current?.count && (
              <Tooltip label={`Empty ${noun} trash`} align="end">
                <Button
                  iconOnly
                  variant="danger-outline"
                  leftIcon={Trash2}
                  aria-label={`Empty ${noun} trash`}
                  onClick={empty}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={canRestore || canDelete ? selection : undefined}
          renderListItem={(row, slots) => (
            <TrashListItem row={row} slots={slots} typeLabel={current?.label ?? ""} actions={rowActions} />
          )}
          renderCard={(row, slots) => (
            <TrashCard row={row} slots={slots} typeLabel={current?.label ?? ""} actions={rowActions} />
          )}
          empty={
            <EmptyState
              icon={Trash2}
              title={filtered ? `No ${noun} match` : `No ${noun} in the trash`}
              description={
                filtered ? "Try a different search or filter." : "Deleted items will show up here."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="items"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canRestore && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={ArchiveRestore}
            onClick={() => restore(selection.ids)}
          >
            Restore
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={XCircle} onClick={() => destroy(selection.ids)}>
            Delete forever
          </Button>
        )}
      </BulkActionBar>
    </>
  );
}
