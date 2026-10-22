"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, Clock, Eye, MessagesSquare, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import { HistoryButton } from "@/app/admin/_components/activity";
import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  StatusBadge,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { useUrlDrawer } from "@/app/admin/_hooks/useUrlDrawer";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import {
  commentsApi,
  type Comment,
  type CommentBulkAction,
  type CommentStatus,
} from "@/app/admin/_lib/api/commentsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { QK } from "@/config/query-keys";
import { ADMIN_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { CommentDrawer } from "./CommentDrawer";
import { CommentKpis, type CommentKpi } from "./CommentKpis";
import { CommentAuthor, CommentCard, CommentListItem, InReplyTo } from "./CommentViews";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "spam", label: "Spam" },
];

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

const KPI_RULES: Record<CommentKpi, FilterRule[]> = {
  all: [],
  pending: [rule("status", "in", ["pending"])],
  approved: [rule("status", "in", ["approved"])],
  rejected: [rule("status", "in", ["rejected"])],
  spam: [rule("status", "in", ["spam"])],
  admin: [rule("is_admin", "is_true")],
};

const signature = (rules: FilterRule[]) =>
  JSON.stringify(rules.map(({ field, op, value }) => [field, op, value]));

const muted = <span className="text-fg-faint">—</span>;

export default function Comments() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["status", "blog_id"] });
  const grid = useGridUrlState();
  const drawer = useUrlDrawer("comment");
  const selection = useBulkSelection();

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.COMMENTS, params],
    queryFn: ({ signal }) => commentsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.COMMENTS, "stats"], queryFn: commentsApi.stats });

  if (!can(PERM.COMMENTS_VIEW)) return <AccessDenied />;

  const canModerate = can(PERM.COMMENTS_MODERATE);
  const canDelete = can(PERM.COMMENTS_DELETE);
  const filtered = list.hasFilters || grid.filters.length > 0;
  const current = signature(grid.filters);
  const activeKpi =
    list.hasFilters && grid.filters.length === 0
      ? null
      : ((Object.keys(KPI_RULES) as CommentKpi[]).find((k) => signature(KPI_RULES[k]) === current) ?? null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [QK.COMMENTS] });
    queryClient.invalidateQueries({ queryKey: [QK.BLOGS] });
  };

  const selectKpi = (kpi: CommentKpi) => {
    selection.clear();
    grid.setFiltersWith(KPI_RULES[kpi], { status: null, blog_id: null, search: null });
  };

  const setStatus = async (row: Comment, status: CommentStatus) => {
    try {
      const res = await commentsApi.setStatus(row.id, status);
      toast.success(res.message ?? "Status changed");
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change status"));
    }
  };

  const remove = async (row: Comment) => {
    const ok = await confirm({
      title: "Delete comment?",
      message: (
        <>
          The comment by <b>{row.author_name}</b>
          {row.replies_count ? ` and its ${row.replies_count} replies` : ""} will be permanently deleted.
        </>
      ),
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await commentsApi.remove(row.id);
      toast.success(res.message ?? "Comment deleted");
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete comment"));
    }
  };

  const bulk = async (action: CommentBulkAction) => {
    if (!selection.count) return;
    if (action === "delete") {
      const ok = await confirm({
        title: `Delete ${selection.count} comment(s)?`,
        message: "Selected comments and their replies will be permanently deleted.",
        confirmLabel: "Delete",
      });
      if (!ok) return;
    }
    try {
      const res = await commentsApi.bulk(selection.ids, action);
      toast.success(res.message ?? "Done");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Bulk action failed"));
    }
  };

  const rowActions = (row: Comment) => (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {canModerate && row.status !== "approved" && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={CircleCheck}
          aria-label="Approve"
          title="Approve"
          onClick={() => setStatus(row, "approved")}
          className="text-fg-faint hover:bg-success-soft hover:text-success"
        />
      )}
      {canModerate && row.status !== "spam" && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={ShieldAlert}
          aria-label="Mark as spam"
          title="Mark as spam"
          onClick={() => setStatus(row, "spam")}
          className="text-fg-faint hover:bg-danger-soft hover:text-danger"
        />
      )}
      <HistoryButton subject={{ type: "blog_comment", id: row.id, label: row.author_name }} />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        leftIcon={Eye}
        aria-label="Open"
        title="Open"
        onClick={() => drawer.open(row.id)}
        className="text-fg-faint hover:bg-primary-soft hover:text-primary"
      />
      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={Trash2}
          aria-label="Delete"
          title="Delete"
          onClick={() => remove(row)}
          className="text-fg-faint hover:bg-danger-soft hover:text-danger"
        />
      )}
    </div>
  );

  const columns: GridColumn<Comment>[] = [
    {
      id: "author_name",
      header: "Author",
      type: "text",
      size: 220,
      alwaysVisible: true,
      cell: (row) => <CommentAuthor row={row} />,
    },
    {
      id: "body",
      header: "Comment",
      type: "text",
      sortable: false,
      size: 360,
      cell: (row) => (
        <span className="block min-w-0">
          <InReplyTo row={row} />
          <span className="text-fg-muted line-clamp-2 text-sm">{row.body}</span>
        </span>
      ),
    },
    {
      id: "blog",
      header: "Post",
      type: "enum",
      size: 220,
      options: (stats?.blogs ?? []).map((b) => ({ value: String(b.id), label: b.title })),
      cell: (row) => (
        <span className="text-fg-muted line-clamp-2 text-sm">{row.blog?.title ?? "Deleted post"}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 120,
      options: STATUS_OPTIONS,
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "replies",
      header: "Replies",
      type: "number",
      size: 90,
      align: "right",
      cell: (row) => row.replies_count ?? 0,
    },
    {
      id: "is_reply",
      header: "Is a reply",
      type: "bool",
      sortable: false,
      size: 100,
      defaultHidden: true,
      cell: (row) => (row.parent_id ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "is_admin",
      header: "Team reply",
      type: "bool",
      size: 110,
      defaultHidden: true,
      cell: (row) => (row.is_admin ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "author_email",
      header: "Email",
      type: "text",
      size: 200,
      defaultHidden: true,
      cell: (row) => row.author_email || muted,
    },
    {
      id: "ip_address",
      header: "IP address",
      type: "text",
      size: 140,
      defaultHidden: true,
      cell: (row) => <span className="font-mono text-xs">{row.ip_address || "—"}</span>,
    },
    {
      id: "created_at",
      header: "Received",
      type: "date",
      size: 130,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.created_at)}
        </span>
      ),
    },
    {
      id: "approved_at",
      header: "Approved",
      type: "date",
      size: 130,
      defaultHidden: true,
      cell: (row) =>
        row.approved_at ? (
          <span title={formatDateTime(row.approved_at)} className="text-fg-subtle whitespace-nowrap">
            {timeAgo(row.approved_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      size: 180,
      minSize: 180,
      alwaysVisible: true,
      align: "right",
      cell: rowActions,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Comments</h1>
      <CommentKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="comments"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search name, email or text…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "comment" : "comments"}
          actions={
            can(PERM.SETTINGS_VIEW) && (
              <Tooltip label="Comment settings" align="end">
                <Button
                  iconOnly
                  variant="secondary"
                  leftIcon={Settings2}
                  aria-label="Comment settings"
                  href={ADMIN_ROUTES.SETTINGS({ tab: "comments" })}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={canModerate || canDelete ? selection : undefined}
          onRowClick={(row) => drawer.open(row.id)}
          highlightId={drawer.id}
          defaultView="list"
          renderListItem={(row, slots) => (
            <CommentListItem
              row={row}
              slots={slots}
              status={<StatusBadge status={row.status} />}
              actions={rowActions(row)}
            />
          )}
          renderCard={(row, slots) => (
            <CommentCard
              row={row}
              slots={slots}
              status={<StatusBadge status={row.status} />}
              actions={rowActions(row)}
            />
          )}
          empty={
            <EmptyState
              icon={MessagesSquare}
              title={filtered ? "No comments match" : "No comments yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Comments visitors leave on blog posts will appear here for approval."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="comments"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canModerate && (
          <>
            <Button size="sm" variant="secondary" leftIcon={CircleCheck} onClick={() => bulk("approve")}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" leftIcon={Clock} onClick={() => bulk("pending")}>
              Pending
            </Button>
            <Button size="sm" variant="secondary" leftIcon={Ban} onClick={() => bulk("reject")}>
              Reject
            </Button>
            <Button size="sm" variant="secondary" leftIcon={ShieldAlert} onClick={() => bulk("spam")}>
              Spam
            </Button>
          </>
        )}
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => bulk("delete")}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <CommentDrawer id={drawer.id} onClose={drawer.close} onSelect={(id) => drawer.replace(id)} />
    </>
  );
}
