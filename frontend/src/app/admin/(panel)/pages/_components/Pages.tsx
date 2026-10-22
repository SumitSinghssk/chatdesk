"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileText, ImageIcon, Plus, Send, Trash2, Undo2 } from "lucide-react";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  RowActions,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { TransferMenu } from "@/app/admin/_components/TransferMenu";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlDrawer } from "@/app/admin/_hooks/useUrlDrawer";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { pagesApi, type Page } from "@/app/admin/_lib/api/pagesApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

import { PageDrawer } from "./PageDrawer";
import { PageKpis, type PageKpi } from "./PageKpis";
import { PageCard, PageListItem, PublishControl, isScheduled } from "./PageViews";

import { QK } from "@/config/query-keys";
const STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

const muted = <span className="text-fg-faint">—</span>;

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

function activeKpi(filters: FilterRule[], legacyStatus: string): PageKpi | null {
  if (legacyStatus) return filters.length ? null : (legacyStatus as PageKpi);
  if (!filters.length) return "all";
  if (filters.length > 1) return null;
  const [r] = filters;
  if (r.field === "status" && r.op === "in" && Array.isArray(r.value) && r.value.length === 1)
    return r.value[0] === "published" || r.value[0] === "draft" ? r.value[0] : null;
  if (r.field === "scheduled" && r.op === "is_true") return "scheduled";
  if (r.field === "featured_image" && r.op === "is_false") return "no_image";
  if (r.field === "updated_at" && r.op === "between") return "updated";
  return null;
}

export default function Pages() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status"] });
  const grid = useGridUrlState();
  const { focusId } = useUrlModal();
  const drawer = useUrlDrawer();
  const selection = useBulkSelection();
  const actions = useListActions({ api: pagesApi, queryKey: QK.PAGES, noun: "page", selection });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: [QK.PAGES, params],
    queryFn: ({ signal }) => pagesApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.PAGES, "stats"], queryFn: pagesApi.stats });

  if (!can(PERM.PAGES_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.PAGES_UPDATE);
  const canDelete = can(PERM.PAGES_DELETE);
  const canCreate = can(PERM.PAGES_CREATE);
  const filtered = list.hasFilters || grid.filters.length > 0;
  const now = dataUpdatedAt;
  const active = activeKpi(grid.filters, list.filters.status);

  const selectKpi = (kpi: PageKpi) => {
    selection.clear();
    const reset = { status: null, search: null };
    if (kpi === "all" || kpi === active) return grid.setFiltersWith([], reset);
    if (kpi === "published" || kpi === "draft") grid.setFiltersWith([rule("status", "in", [kpi])], reset);
    else if (kpi === "scheduled") grid.setFiltersWith([rule("scheduled", "is_true")], reset);
    else if (kpi === "no_image") grid.setFiltersWith([rule("featured_image", "is_false")], reset);
    else {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
      grid.setFiltersWith([rule("updated_at", "between", [toYmd(from), toYmd(today)])], reset);
    }
  };

  const rowActions = (row: Page) => (
    <RowActions
      history={{ type: "page", id: row.id, label: row.title }}
      onEdit={canUpdate ? () => drawer.open(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, row.title) : undefined}
    />
  );
  const toggle = canUpdate ? (row: Page) => () => actions.toggle(row.id) : undefined;

  const columns: GridColumn<Page>[] = [
    {
      id: "title",
      header: "Page",
      type: "text",
      size: 340,
      alwaysVisible: true,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.featured_image ? (
            <img src={row.featured_image} alt="" className="h-9 w-12 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="bg-page text-fg-subtle flex h-9 w-12 shrink-0 items-center justify-center rounded-md">
              <ImageIcon size={15} />
            </span>
          )}
          <div className="min-w-0">
            <Link
              href={drawer.href(row.id)}
              scroll={false}
              className="text-fg hover:text-primary block truncate font-semibold hover:underline"
            >
              {row.title}
            </Link>
            <p className="text-fg-subtle truncate text-xs">/{row.slug}</p>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Published",
      type: "enum",
      size: 170,
      options: STATUS_OPTIONS,
      cell: (row) => <PublishControl row={row} now={now} onToggle={toggle?.(row)} />,
    },
    {
      id: "published_at",
      header: "Publish date",
      type: "date",
      size: 140,
      cell: (row) =>
        row.published_at ? (
          <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.published_at)}>
            {formatDate(row.published_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "author",
      header: "Author",
      type: "text",
      size: 150,
      cell: (row) => <span className="text-fg-subtle">{row.author?.name ?? "—"}</span>,
    },
    {
      id: "updated_at",
      header: "Last edited",
      type: "date",
      size: 130,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.updated_at)}>
          {timeAgo(row.updated_at)}
        </span>
      ),
    },
    {
      id: "slug",
      header: "Slug",
      type: "text",
      size: 200,
      defaultHidden: true,
      cell: (row) => <span className="text-fg-subtle font-mono text-xs">/{row.slug}</span>,
    },
    {
      id: "featured_image",
      header: "Has image",
      type: "bool",
      sortable: false,
      size: 110,
      defaultHidden: true,
      cell: (row) => (row.featured_image ? "Yes" : <span className="text-danger">No</span>),
    },
    {
      id: "scheduled",
      header: "Scheduled",
      type: "bool",
      sortable: false,
      size: 110,
      defaultHidden: true,
      cell: (row) => (isScheduled(row, now) ? "Yes" : "No"),
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
      id: "id",
      header: "ID",
      type: "number",
      size: 80,
      defaultHidden: true,
      cell: (row) => <span className="text-fg-subtle tabular-nums">#{row.id}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      size: 96,
      align: "right",
      cell: rowActions,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Pages</h1>
      <PageKpis stats={stats} active={active} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="pages"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search pages…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "page" : "pages"}
          actions={
            <>
              <TransferMenu
                compact
                type="pages"
                queryKey={QK.PAGES}
                canExport={can(PERM.PAGES_VIEW)}
                canImport={canCreate}
              />
              {canCreate && (
                <Tooltip label="New page" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New page"
                    onClick={() => drawer.open("new")}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={(row) => drawer.open(row.id)}
          highlightId={drawer.id ?? focusId}
          renderListItem={(row, slots) => (
            <PageListItem
              row={row}
              slots={slots}
              href={drawer.href(row.id)}
              now={now}
              onToggle={toggle?.(row)}
              actions={rowActions(row)}
            />
          )}
          renderCard={(row, slots) => (
            <PageCard
              row={row}
              slots={slots}
              href={drawer.href(row.id)}
              now={now}
              onToggle={toggle?.(row)}
              actions={rowActions(row)}
            />
          )}
          empty={
            <EmptyState
              icon={FileText}
              title={filtered ? "No pages match your filters" : "No pages yet"}
              description={
                filtered ? "Try a different search or filter." : "Create your first page to get started."
              }
              action={
                !filtered &&
                canCreate && (
                  <Button leftIcon={Plus} onClick={() => drawer.open("new")}>
                    New page
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
              unit="pages"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canUpdate && (
          <>
            <Button size="sm" variant="secondary" leftIcon={Send} onClick={() => actions.bulk("activate")}>
              Publish
            </Button>
            <Button size="sm" variant="secondary" leftIcon={Undo2} onClick={() => actions.bulk("deactivate")}>
              Unpublish
            </Button>
          </>
        )}
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => actions.bulk("delete")}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <PageDrawer value={drawer.value} onClose={drawer.close} onCreated={(id) => drawer.replace(id)} />
    </>
  );
}
