"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Badge,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  RowActions,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { TransferMenu } from "@/app/admin/_components/TransferMenu";
import { useBulkSelection, type BulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { seoApi, type SeoPage } from "@/app/admin/_lib/api/seoApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDate, formatDateTime } from "@/lib/utils";

import { SeoKpis, type SeoKpi } from "./SeoKpis";
import SeoModal from "./SeoModal";
import { SeoCard, SeoListItem } from "./SeoViews";

import { QK } from "@/config/query-keys";
const muted = <span className="text-fg-faint">—</span>;

const KPI_RULES: Record<Exclude<SeoKpi, "all">, Pick<FilterRule, "field" | "op">> = {
  indexable: { field: "allow_indexing", op: "is_true" },
  noindex: { field: "allow_indexing", op: "is_false" },
  no_description: { field: "meta_description", op: "is_empty" },
  no_title: { field: "meta_title", op: "is_empty" },
  faqs: { field: "faqs", op: "is_true" },
};

export default function Seo() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["indexing"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({
    api: { remove: seoApi.remove, bulk: (ids) => seoApi.bulkDelete(ids) },
    queryKey: QK.SEO,
    noun: "SEO entry",
    selection,
    softDelete: false,
  });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.SEO, params],
    queryFn: ({ signal }) => seoApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.SEO, "stats"], queryFn: () => seoApi.stats() });
  const onPage = modal.editId ? data?.items.find((r) => r.id === modal.editId) : undefined;
  const { data: fetched } = useQuery({
    queryKey: [QK.SEO, "detail", modal.editId],
    queryFn: () => seoApi.get(modal.editId!),
    enabled: !!modal.editId && !onPage && !isLoading,
  });

  if (!can(PERM.SEO_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.SEO_UPDATE);
  const canDelete = can(PERM.SEO_DELETE);
  const editing = modal.editId ? (onPage ?? fetched ?? null) : null;

  const defaultIds = new Set((data?.items ?? []).filter((r) => r.is_default).map((r) => r.id));
  const keep = (ids: number[]) => ids.filter((id) => !defaultIds.has(id));
  const gridSelection: BulkSelection = {
    ...selection,
    toggle: (id) => {
      if (!defaultIds.has(id)) selection.toggle(id);
    },
    togglePage: (ids) => selection.togglePage(keep(ids)),
    pageState: (ids) => selection.pageState(keep(ids)),
  };

  const activeKpi: SeoKpi | null = !grid.filters.length
    ? list.hasFilters
      ? null
      : "all"
    : grid.filters.length === 1
      ? ((Object.entries(KPI_RULES).find(
          ([, r]) => r.field === grid.filters[0].field && r.op === grid.filters[0].op
        )?.[0] as SeoKpi | undefined) ?? null)
      : null;

  const selectKpi = (kpi: SeoKpi) => {
    selection.clear();
    const reset = { indexing: null, search: null };
    if (kpi === "all") grid.setFiltersWith([], reset);
    else grid.setFiltersWith([{ id: kpi, ...KPI_RULES[kpi], value: null }], reset);
  };

  const rowActions = (row: SeoPage) => (
    <RowActions
      history={{ type: "seo_page", id: row.id, label: `${row.page} (${row.path})` }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={
        canDelete && !row.is_default ? () => actions.remove(row.id, `${row.page} (${row.path})`) : undefined
      }
    />
  );

  const columns: GridColumn<SeoPage>[] = [
    {
      id: "page",
      header: "Page",
      type: "text",
      size: 200,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-fg truncate font-medium">{row.page}</span>
          {row.is_default && <Badge tone="brand">Default</Badge>}
        </span>
      ),
    },
    {
      id: "path",
      header: "Path",
      type: "text",
      size: 200,
      cell: (row) => <span className="text-fg-subtle font-mono text-xs">{row.path}</span>,
    },
    {
      id: "meta_title",
      header: "Meta title",
      type: "text",
      size: 240,
      cell: (row) => row.meta_title || <span className="text-fg-subtle italic">No meta title</span>,
    },
    {
      id: "meta_description",
      header: "Meta description",
      type: "text",
      size: 280,
      cell: (row) =>
        row.meta_description ? (
          <span className="text-fg-subtle" title={row.meta_description}>
            {row.meta_description}
          </span>
        ) : (
          <span className="text-danger italic">Missing</span>
        ),
    },
    {
      id: "allow_indexing",
      header: "Indexing",
      type: "bool",
      size: 120,
      cell: (row) =>
        row.allow_indexing ? (
          <Badge tone="success" dot>
            Indexed
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            No-index
          </Badge>
        ),
    },
    {
      id: "faqs",
      header: "FAQs",
      type: "bool",
      sortable: false,
      size: 90,
      align: "right",
      cell: (row) => row.faqs.length || muted,
    },
    {
      id: "meta_keywords",
      header: "Keywords",
      type: "text",
      sortable: false,
      size: 200,
      defaultHidden: true,
      cell: (row) => row.meta_keywords || muted,
    },
    {
      id: "canonical_url",
      header: "Canonical URL",
      type: "text",
      size: 220,
      defaultHidden: true,
      cell: (row) =>
        row.canonical_url ? <span className="font-mono text-xs">{row.canonical_url}</span> : muted,
    },
    {
      id: "og_image",
      header: "Social image",
      type: "text",
      sortable: false,
      size: 180,
      defaultHidden: true,
      cell: (row) => (row.og_image ? <span className="font-mono text-xs">{row.og_image}</span> : muted),
    },
    {
      id: "updated_at",
      header: "Updated",
      type: "date",
      size: 130,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.updated_at)}>
          {formatDate(row.updated_at)}
        </span>
      ),
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
      <h1 className="sr-only">SEO</h1>
      <SeoKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="seo"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search page, path or title…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "entry" : "entries"}
          actions={
            <>
              <TransferMenu
                compact
                type="seo"
                queryKey={QK.SEO}
                canExport={can(PERM.SEO_VIEW)}
                canImport={can(PERM.SEO_CREATE)}
              />
              {can(PERM.SEO_CREATE) && (
                <Tooltip label="New SEO entry" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New SEO entry"
                    onClick={modal.openCreate}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canDelete ? gridSelection : undefined}
          isSelectable={(row) => !row.is_default}
          onRowClick={canUpdate ? (row) => modal.openEdit(row.id) : undefined}
          highlightId={modal.focusId}
          renderListItem={(row, slots) => <SeoListItem row={row} slots={slots} actions={rowActions(row)} />}
          renderCard={(row, slots) => <SeoCard row={row} slots={slots} actions={rowActions(row)} />}
          empty={
            <EmptyState
              title={filtered ? "No entries match your filters" : "No SEO entries yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Add an entry to customise a page's meta tags. The * entry is the site-wide fallback."
              }
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

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => actions.bulk("delete")}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <SeoModal
        open={(modal.isCreate && can(PERM.SEO_CREATE)) || (!!editing && canUpdate)}
        entry={modal.isCreate ? null : editing}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
