"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ImageIcon, MessagesSquare, Plus, Send, Trash2, Undo2 } from "lucide-react";

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
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import { TransferMenu } from "@/app/admin/_components/TransferMenu";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlDrawer } from "@/app/admin/_hooks/useUrlDrawer";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { blogCategoriesApi } from "@/app/admin/_lib/api/blogCategoriesApi";
import { blogsApi, type Blog } from "@/app/admin/_lib/api/blogsApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

import { BlogDrawer } from "./BlogDrawer";
import { BlogKpis, type BlogKpi } from "./BlogKpis";
import { BlogCard, BlogListItem, CommentCount, PublishControl, isScheduled } from "./BlogViews";

import { QK } from "@/config/query-keys";
import { ADMIN_ROUTES } from "@/config/routes";
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

function activeKpi(filters: FilterRule[], legacy: { status: string; category_id: string }): BlogKpi | null {
  if (legacy.category_id) return null;
  if (legacy.status) return filters.length ? null : (legacy.status as BlogKpi);
  if (!filters.length) return "all";
  if (filters.length > 1) return null;
  const [r] = filters;
  if (r.field === "status" && r.op === "in" && Array.isArray(r.value) && r.value.length === 1)
    return r.value[0] === "published" || r.value[0] === "draft" ? r.value[0] : null;
  if (r.field === "scheduled" && r.op === "is_true") return "scheduled";
  if (r.field === "featured_image" && r.op === "is_false") return "no_image";
  if (r.field === "published_at" && r.op === "between") return "recent";
  return null;
}

export default function Blogs() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status", "category_id"] });
  const grid = useGridUrlState();
  const { focusId } = useUrlModal();
  const drawer = useUrlDrawer();
  const selection = useBulkSelection();
  const actions = useListActions({ api: blogsApi, queryKey: QK.BLOGS, noun: "post", selection });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: [QK.BLOGS, params],
    queryFn: ({ signal }) => blogsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.BLOGS, "stats"], queryFn: blogsApi.stats });
  const { data: categories = [] } = useQuery({
    queryKey: [QK.BLOG_CATEGORIES, "all"],
    queryFn: () => blogCategoriesApi.all(),
  });

  if (!can(PERM.BLOGS_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.BLOGS_UPDATE);
  const canDelete = can(PERM.BLOGS_DELETE);
  const canCreate = can(PERM.BLOGS_CREATE);
  const canViewComments = can(PERM.COMMENTS_VIEW);
  const filtered = list.hasFilters || grid.filters.length > 0;
  const now = dataUpdatedAt;
  const active = activeKpi(grid.filters, list.filters);

  const selectKpi = (kpi: BlogKpi) => {
    selection.clear();
    const reset = { status: null, category_id: null, search: null };
    if (kpi === "all" || kpi === active) return grid.setFiltersWith([], reset);
    if (kpi === "published" || kpi === "draft") grid.setFiltersWith([rule("status", "in", [kpi])], reset);
    else if (kpi === "scheduled") grid.setFiltersWith([rule("scheduled", "is_true")], reset);
    else if (kpi === "no_image") grid.setFiltersWith([rule("featured_image", "is_false")], reset);
    else {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
      grid.setFiltersWith([rule("published_at", "between", [toYmd(from), toYmd(today)])], reset);
    }
  };

  const rowActions = (row: Blog) => (
    <RowActions
      history={{ type: "blog", id: row.id, label: row.title }}
      onEdit={canUpdate ? () => drawer.open(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, row.title) : undefined}
    />
  );
  const toggle = canUpdate ? (row: Blog) => () => actions.toggle(row.id) : undefined;

  const columns: GridColumn<Blog>[] = [
    {
      id: "title",
      header: "Post",
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
      id: "categories",
      header: "Categories",
      type: "enum",
      sortable: false,
      size: 200,
      options: categories.map((c) => ({ value: String(c.id), label: c.name })),
      cell: (row) =>
        row.categories.length ? (
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {row.categories.map((c) => (
              <Badge key={c.id} tone="blue">
                {c.name}
              </Badge>
            ))}
          </span>
        ) : (
          muted
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
      id: "comments",
      header: "Comments",
      type: "number",
      size: 130,
      cell: (row) => <CommentCount row={row} linked={canViewComments} />,
    },
    {
      id: "pending_comments",
      header: "Awaiting approval",
      type: "number",
      size: 150,
      defaultHidden: true,
      cell: (row) => row.pending_comments ?? 0,
    },
    {
      id: "comments_enabled",
      header: "Comments open",
      type: "bool",
      size: 140,
      defaultHidden: true,
      cell: (row) => (row.comments_enabled ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "author",
      header: "Author",
      type: "text",
      size: 150,
      cell: (row) => <span className="text-fg-subtle">{row.author?.name ?? "—"}</span>,
    },
    {
      id: "excerpt",
      header: "Excerpt",
      type: "text",
      sortable: false,
      size: 280,
      defaultHidden: true,
      cell: (row) => <span className="text-fg-subtle">{row.excerpt || "—"}</span>,
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
      id: "updated_at",
      header: "Last edited",
      type: "date",
      size: 130,
      defaultHidden: true,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.updated_at)}>
          {timeAgo(row.updated_at)}
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
      <h1 className="sr-only">Blog posts</h1>
      <BlogKpis stats={stats} active={active} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="blogs"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search posts…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "post" : "posts"}
          actions={
            <>
              <TransferMenu
                compact
                type="blogs"
                queryKey={QK.BLOGS}
                canExport={can(PERM.BLOGS_VIEW)}
                canImport={canCreate}
              />
              {canViewComments && (
                <Tooltip
                  label={
                    stats?.pending_comments
                      ? `Comments (${stats.pending_comments} awaiting approval)`
                      : "Comments"
                  }
                  align="end"
                >
                  <span className="relative inline-flex">
                    <Button
                      iconOnly
                      variant="secondary"
                      leftIcon={MessagesSquare}
                      aria-label="Comments"
                      href={ADMIN_ROUTES.COMMENTS()}
                      className="h-9 w-9"
                    />
                    {!!stats?.pending_comments && (
                      <span className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
                        {stats.pending_comments > 99 ? "99+" : stats.pending_comments}
                      </span>
                    )}
                  </span>
                </Tooltip>
              )}
              {canCreate && (
                <Tooltip label="New post" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New post"
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
            <BlogListItem
              row={row}
              slots={slots}
              href={drawer.href(row.id)}
              now={now}
              onToggle={toggle?.(row)}
              actions={rowActions(row)}
              canViewComments={canViewComments}
            />
          )}
          renderCard={(row, slots) => (
            <BlogCard
              row={row}
              slots={slots}
              href={drawer.href(row.id)}
              now={now}
              onToggle={toggle?.(row)}
              actions={rowActions(row)}
              canViewComments={canViewComments}
            />
          )}
          empty={
            <EmptyState
              icon={BookOpen}
              title={filtered ? "No posts match your filters" : "No posts yet"}
              description={
                filtered ? "Try a different search or filter." : "Write your first article to get started."
              }
              action={
                !filtered &&
                canCreate && (
                  <Button leftIcon={Plus} onClick={() => drawer.open("new")}>
                    New post
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
              unit="posts"
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

      <BlogDrawer value={drawer.value} onClose={drawer.close} onCreated={(id) => drawer.replace(id)} />
    </>
  );
}
