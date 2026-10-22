"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Power, PowerOff, Trash2 } from "lucide-react";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  RowActions,
  StatusBadge,
  Switch,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { TransferMenu } from "@/app/admin/_components/TransferMenu";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { REDIRECT_CODE_OPTIONS, redirectsApi, type Redirect } from "@/app/admin/_lib/api/redirectsApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

import { RedirectKpis, type RedirectKpi } from "./RedirectKpis";
import RedirectModal from "./RedirectModal";
import { CodeBadge, RedirectCard, RedirectListItem } from "./RedirectViews";

import { QK } from "@/config/query-keys";
const muted = <span className="text-fg-faint">—</span>;
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

export default function Redirects() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status", "status_code"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({
    api: redirectsApi,
    queryKey: QK.REDIRECTS,
    noun: "redirect",
    selection,
    softDelete: false,
  });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.REDIRECTS, params],
    queryFn: ({ signal }) => redirectsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: [QK.REDIRECTS, "stats"],
    queryFn: () => redirectsApi.stats(),
  });
  const onPage = modal.editId ? data?.items.find((r) => r.id === modal.editId) : undefined;
  const { data: fetched } = useQuery({
    queryKey: [QK.REDIRECTS, "detail", modal.editId],
    queryFn: () => redirectsApi.get(modal.editId!),
    enabled: !!modal.editId && !onPage && !isLoading,
  });

  if (!can(PERM.REDIRECTS_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.REDIRECTS_UPDATE);
  const canDelete = can(PERM.REDIRECTS_DELETE);
  const editing = modal.editId ? (onPage ?? fetched ?? null) : null;

  const only = grid.filters.length === 1 ? grid.filters[0] : null;
  const onlyValue = Array.isArray(only?.value) && only.value.length === 1 ? only.value[0] : null;
  const activeKpi: RedirectKpi | null = list.hasFilters
    ? null
    : !grid.filters.length
      ? grid.sort[0]?.id === "hits" && grid.sort[0].desc
        ? "hits"
        : grid.sort.length
          ? null
          : "all"
      : only?.field === "status" && only.op === "in" && onlyValue === "active"
        ? "active"
        : only?.field === "hits" && only.op === "eq" && only.value === "0"
          ? "unused"
          : only?.field === "status_code" && only.op === "in" && onlyValue
            ? { code: onlyValue }
            : null;

  const selectKpi = (kpi: RedirectKpi) => {
    selection.clear();
    const reset = { status: null, status_code: null, search: null, sort: null };
    if (kpi === "all") grid.setFiltersWith([], reset);
    else if (kpi === "active") grid.setFiltersWith([rule("status", "in", ["active"])], reset);
    else if (kpi === "hits") grid.setFiltersWith([], { ...reset, sort: "-hits" });
    else if (kpi === "unused") grid.setFiltersWith([rule("hits", "eq", "0")], reset);
    else grid.setFiltersWith([rule("status_code", "in", [kpi.code])], reset);
  };

  const statusControl = (row: Redirect) =>
    canUpdate ? (
      <Switch
        size="sm"
        checked={row.status === "active"}
        onChange={() => actions.toggle(row.id)}
        aria-label="Toggle status"
      />
    ) : (
      <StatusBadge status={row.status} />
    );

  const rowActions = (row: Redirect) => (
    <RowActions
      history={{ type: "redirect", id: row.id, label: row.source_path }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, row.source_path) : undefined}
    />
  );

  const columns: GridColumn<Redirect>[] = [
    {
      id: "source_path",
      header: "Source",
      type: "text",
      size: 230,
      alwaysVisible: true,
      cell: (row) => (
        <span className="text-fg font-mono text-xs font-semibold" title={row.source_path}>
          {row.source_path}
        </span>
      ),
    },
    {
      id: "target_url",
      header: "Target",
      type: "text",
      size: 260,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs" title={row.target_url}>
          <ArrowRight size={13} className="text-fg-subtle shrink-0" aria-label="redirects to" />
          <span className="text-primary truncate">{row.target_url}</span>
        </span>
      ),
    },
    {
      id: "status_code",
      header: "Type",
      type: "enum",
      size: 90,
      options: REDIRECT_CODE_OPTIONS,
      cell: (row) => <CodeBadge row={row} />,
    },
    {
      id: "hits",
      header: "Hits",
      type: "number",
      size: 90,
      align: "right",
      cell: (row) => row.hits.toLocaleString(),
    },
    {
      id: "last_hit_at",
      header: "Last hit",
      type: "date",
      size: 130,
      cell: (row) => (
        <span
          title={row.last_hit_at ? formatDateTime(row.last_hit_at) : undefined}
          className="text-fg-subtle whitespace-nowrap"
        >
          {row.last_hit_at ? timeAgo(row.last_hit_at) : "Never"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 110,
      options: STATUS_OPTIONS,
      cell: statusControl,
    },
    {
      id: "note",
      header: "Note",
      type: "text",
      size: 200,
      cell: (row) => (row.note ? <span className="text-fg-subtle">{row.note}</span> : muted),
    },
    {
      id: "created_at",
      header: "Created",
      type: "date",
      size: 130,
      defaultHidden: true,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.created_at)}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      id: "updated_at",
      header: "Updated",
      type: "date",
      size: 130,
      defaultHidden: true,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.updated_at)}>
          {formatDate(row.updated_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      size: 96,
      minSize: 80,
      align: "right",
      cell: rowActions,
    },
  ];

  const filtered = list.hasFilters || grid.filters.length > 0;

  return (
    <>
      <h1 className="sr-only">Redirects</h1>
      <RedirectKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="redirects"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search URLs or notes…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "redirect" : "redirects"}
          actions={
            <>
              <TransferMenu
                compact
                type="redirects"
                queryKey={QK.REDIRECTS}
                canExport={can(PERM.REDIRECTS_VIEW)}
                canImport={can(PERM.REDIRECTS_CREATE)}
              />
              {can(PERM.REDIRECTS_CREATE) && (
                <Tooltip label="New redirect" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New redirect"
                    onClick={modal.openCreate}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={canUpdate ? (row) => modal.openEdit(row.id) : undefined}
          highlightId={modal.focusId}
          renderListItem={(row, slots) => (
            <RedirectListItem row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          renderCard={(row, slots) => (
            <RedirectCard row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          empty={
            <EmptyState
              title={filtered ? "No redirects match your filters" : "No redirects yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Create one here, or straight from the 404 log when a broken link shows up."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="redirects"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canUpdate && (
          <>
            <Button size="sm" variant="secondary" leftIcon={Power} onClick={() => actions.bulk("activate")}>
              Activate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={PowerOff}
              onClick={() => actions.bulk("deactivate")}
            >
              Deactivate
            </Button>
          </>
        )}
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => actions.bulk("delete")}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <RedirectModal
        open={(modal.isCreate && can(PERM.REDIRECTS_CREATE)) || (!!editing && canUpdate)}
        redirect={modal.isCreate ? null : editing}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
