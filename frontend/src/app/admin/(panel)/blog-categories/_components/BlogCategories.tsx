"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderTree, Plus, Power, PowerOff, Trash2 } from "lucide-react";

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
import { blogCategoriesApi, type BlogCategory } from "@/app/admin/_lib/api/blogCategoriesApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo } from "@/lib/utils";

import BlogCategoryModal from "./BlogCategoryModal";
import { BlogCategoryKpis, type BlogCategoryKpi } from "./BlogCategoryKpis";
import { BlogCategoryCard, BlogCategoryListItem, CategoryThumb } from "./BlogCategoryViews";

import { QK } from "@/config/query-keys";
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const muted = <span className="text-fg-faint">—</span>;

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

const KPI_RULES: Record<BlogCategoryKpi, FilterRule[]> = {
  all: [],
  active: [rule("status", "in", ["active"])],
  inactive: [rule("status", "in", ["inactive"])],
  top_level: [rule("parent", "is_empty")],
  subcategories: [rule("parent", "is_not_empty")],
  empty: [rule("posts", "eq", "0")],
};

const signature = (rules: FilterRule[]) =>
  JSON.stringify(rules.map(({ field, op, value }) => [field, op, value]));

export default function BlogCategories() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status", "parent_id"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({
    api: blogCategoriesApi,
    queryKey: QK.BLOG_CATEGORIES,
    noun: "category",
    selection,
  });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.BLOG_CATEGORIES, params],
    queryFn: ({ signal }) => blogCategoriesApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: [QK.BLOG_CATEGORIES, "stats"],
    queryFn: blogCategoriesApi.stats,
  });
  const { data: allCategories = [] } = useQuery({
    queryKey: [QK.BLOG_CATEGORIES, "all"],
    queryFn: () => blogCategoriesApi.all(),
  });

  if (!can(PERM.BLOG_CATEGORIES_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.BLOG_CATEGORIES_UPDATE);
  const canDelete = can(PERM.BLOG_CATEGORIES_DELETE);
  const editing = modal.editId ? (allCategories.find((c) => c.id === modal.editId) ?? null) : null;
  const filtered = list.hasFilters || grid.filters.length > 0;
  const current = signature(grid.filters);
  const activeKpi =
    list.hasFilters && grid.filters.length === 0
      ? null
      : ((Object.keys(KPI_RULES) as BlogCategoryKpi[]).find((k) => signature(KPI_RULES[k]) === current) ??
        null);

  const selectKpi = (kpi: BlogCategoryKpi) => {
    selection.clear();
    grid.setFiltersWith(KPI_RULES[kpi], { status: null, parent_id: null, search: null });
  };

  const statusControl = (row: BlogCategory) =>
    canUpdate ? (
      <Switch
        size="sm"
        checked={row.status === "active"}
        onChange={() => actions.toggle(row.id)}
        aria-label={`Toggle status for ${row.name}`}
      />
    ) : (
      <StatusBadge status={row.status} />
    );

  const rowActions = (row: BlogCategory) => (
    <RowActions
      history={{ type: "blog_category", id: row.id, label: row.name }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, row.name) : undefined}
    />
  );

  const columns: GridColumn<BlogCategory>[] = [
    {
      id: "name",
      header: "Category",
      type: "text",
      size: 240,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <CategoryThumb row={row} className="h-7 w-7" />
          <span className="text-fg truncate font-medium">{row.name}</span>
        </span>
      ),
    },
    {
      id: "slug",
      header: "Slug",
      type: "text",
      size: 180,
      cell: (row) => <span className="text-fg-subtle font-mono text-xs">/{row.slug}</span>,
    },
    {
      id: "parent",
      header: "Parent",
      type: "enum",
      sortable: false,
      size: 170,
      options: allCategories.map((c) => ({ value: String(c.id), label: c.name })),
      cell: (row) => row.parent?.name ?? <span className="text-fg-faint">Top-level</span>,
    },
    {
      id: "description",
      header: "Description",
      type: "text",
      sortable: false,
      size: 260,
      defaultHidden: true,
      cell: (row) => row.description || muted,
    },
    {
      id: "posts",
      header: "Posts",
      type: "number",
      size: 90,
      align: "right",
      cell: (row) => row.blog_count ?? 0,
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
      id: "image",
      header: "Image",
      type: "bool",
      sortable: false,
      size: 90,
      defaultHidden: true,
      cell: (row) => (row.image ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "created_at",
      header: "Created",
      type: "date",
      size: 130,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.created_at)}
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
        <span title={formatDateTime(row.updated_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.updated_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      size: 90,
      minSize: 90,
      alwaysVisible: true,
      align: "right",
      cell: rowActions,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Blog categories</h1>
      <BlogCategoryKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="blog-categories"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search categories…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "category" : "categories"}
          actions={
            <>
              <TransferMenu
                compact
                type="blog_categories"
                queryKey={QK.BLOG_CATEGORIES}
                canExport={can(PERM.BLOG_CATEGORIES_VIEW)}
                canImport={can(PERM.BLOG_CATEGORIES_CREATE)}
              />
              {can(PERM.BLOG_CATEGORIES_CREATE) && (
                <Tooltip label="New category" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New category"
                    onClick={modal.openCreate}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={canUpdate ? (row) => modal.openEdit(row.id) : undefined}
          highlightId={modal.focusId ?? modal.editId}
          renderListItem={(row, slots) => (
            <BlogCategoryListItem
              row={row}
              slots={slots}
              status={statusControl(row)}
              actions={rowActions(row)}
            />
          )}
          renderCard={(row, slots) => (
            <BlogCategoryCard row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          empty={
            <EmptyState
              icon={FolderTree}
              title={filtered ? "No categories match" : "No categories yet"}
              description={
                filtered ? "Try a different search or filter." : "Create your first category to group posts."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="categories"
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

      <BlogCategoryModal
        open={modal.isCreate || !!editing}
        category={editing}
        categories={allCategories}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
