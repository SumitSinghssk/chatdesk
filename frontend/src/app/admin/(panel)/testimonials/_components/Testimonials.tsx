"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, MessageSquareQuote, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  DataGrid,
  ToolbarIconButton,
  useGridUrlState,
  type FilterRule,
  type GridColumn,
} from "@/app/admin/_components/grid";
import { useGridPrefs } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Avatar,
  Badge,
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
import { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { testimonialsApi, type Testimonial } from "@/app/admin/_lib/api/testimonialsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo } from "@/lib/utils";

import TestimonialModal from "./TestimonialModal";
import { TestimonialKpis, type TestimonialKpi } from "./TestimonialKpis";
import { Stars, TestimonialCard, TestimonialListItem } from "./TestimonialViews";

import { QK } from "@/config/query-keys";
const GRID_ID = "testimonials";

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

const kpiRules = (kpi: TestimonialKpi): FilterRule[] => {
  if (typeof kpi === "object") return [rule("rating", "eq", String(kpi.rating))];
  return {
    all: [],
    active: [rule("status", "in", ["active"])],
    inactive: [rule("status", "in", ["inactive"])],
    featured: [rule("is_featured", "is_true")],
    top_rated: [rule("rating", "gte", "4")],
  }[kpi];
};

const signature = (rules: FilterRule[]) =>
  JSON.stringify(rules.map(({ field, op, value }) => [field, op, value]));
const NAMED_KPIS = ["all", "active", "inactive", "featured", "top_rated"] as const;

export default function Testimonials() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status", "rating", "featured"] });
  const grid = useGridUrlState();
  const [prefs, savePrefs] = useGridPrefs(GRID_ID);
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({
    api: testimonialsApi,
    queryKey: QK.TESTIMONIALS,
    noun: "testimonial",
    selection,
  });
  const queryClient = useQueryClient();
  const [reordering, setReordering] = useState(false);
  const sort = useDragSort({ onMove: (from, to) => reorder(from, to) });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.TESTIMONIALS, params],
    queryFn: ({ signal }) => testimonialsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.TESTIMONIALS, "stats"], queryFn: testimonialsApi.stats });
  const inPage = data?.items.find((t) => t.id === modal.editId);
  const { data: fetched } = useQuery({
    queryKey: [QK.TESTIMONIALS, "detail", modal.editId],
    queryFn: () => testimonialsApi.get(modal.editId!),
    enabled: !!modal.editId && !!data && !inPage,
  });

  if (!can(PERM.TESTIMONIALS_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.TESTIMONIALS_UPDATE);
  const canDelete = can(PERM.TESTIMONIALS_DELETE);
  const editing = modal.editId ? (inPage ?? fetched ?? null) : null;
  const filtered = list.hasFilters || grid.filters.length > 0;
  const orderIntact = !filtered && grid.sort.length === 0;
  const canReorder = canUpdate && orderIntact;
  const inListView = prefs.view === "list";
  const offset = data ? (data.meta.page - 1) * data.meta.per_page : 0;

  const current = signature(grid.filters);
  const activeKpi =
    list.hasFilters && grid.filters.length === 0
      ? null
      : (NAMED_KPIS.find((k) => signature(kpiRules(k)) === current) ?? null);

  const selectKpi = (kpi: TestimonialKpi) => {
    selection.clear();
    grid.setFiltersWith(kpiRules(kpi), { status: null, rating: null, featured: null, search: null });
  };

  const reorder = async (from: number, to: number) => {
    const pageItems = data?.items ?? [];
    const moved = pageItems[from];
    if (!moved) return;
    const nextItems = [...pageItems];
    nextItems.splice(to, 0, ...nextItems.splice(from, 1));
    queryClient.setQueryData([QK.TESTIMONIALS, params], { ...data!, items: nextItems });
    setReordering(true);
    try {
      const ids = (await testimonialsApi.all()).map((t) => t.id);
      const currentIndex = ids.indexOf(moved.id);
      if (currentIndex < 0) return;
      ids.splice(currentIndex, 1);
      ids.splice(offset + to, 0, moved.id);
      await testimonialsApi.reorder(ids);
      await actions.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change the order"));
    } finally {
      setReordering(false);
    }
  };

  const statusControl = (row: Testimonial) =>
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

  const rowActions = (row: Testimonial) => (
    <RowActions
      history={{ type: "testimonial", id: row.id, label: row.name }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, row.name) : undefined}
    />
  );

  const columns: GridColumn<Testimonial>[] = [
    {
      id: "name",
      header: "Author",
      type: "text",
      size: 210,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photo} size={26} />
          <span className="text-fg truncate font-medium">{row.name}</span>
        </span>
      ),
    },
    {
      id: "designation",
      header: "Designation",
      type: "text",
      size: 160,
      cell: (row) => row.designation || muted,
    },
    { id: "company", header: "Company", type: "text", size: 160, cell: (row) => row.company || muted },
    {
      id: "quote",
      header: "Quote",
      type: "text",
      sortable: false,
      size: 300,
      cell: (row) => (
        <span className="text-fg-muted" title={row.quote}>
          “{row.quote}”
        </span>
      ),
    },
    {
      id: "rating",
      header: "Rating",
      type: "number",
      size: 120,
      cell: (row) => <Stars rating={row.rating} />,
    },
    {
      id: "is_featured",
      header: "Featured",
      type: "bool",
      size: 110,
      cell: (row) => (row.is_featured ? <Badge tone="purple">Featured</Badge> : muted),
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
      id: "sort_order",
      header: "Order",
      type: "number",
      size: 90,
      align: "right",
      defaultHidden: true,
      cell: (row) => row.sort_order,
    },
    {
      id: "photo",
      header: "Photo",
      type: "bool",
      sortable: false,
      size: 90,
      defaultHidden: true,
      cell: (row) => (row.photo ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "created_at",
      header: "Added",
      type: "date",
      size: 130,
      defaultHidden: true,
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

  const reorderToolbar = canUpdate && (
    <>
      {inListView ? (
        <span className="text-fg-subtle hidden truncate text-xs md:inline">
          {orderIntact
            ? "· Drag rows by the grip to set the website order"
            : "· Clear search, filters and sorting to reorder"}
        </span>
      ) : (
        <ToolbarIconButton
          icon={ArrowDownUp}
          label="Reorder (opens List view)"
          tooltipAlign="start"
          onClick={() => savePrefs({ view: "list" })}
        />
      )}
    </>
  );

  return (
    <>
      <h1 className="sr-only">Testimonials</h1>
      <TestimonialKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id={GRID_ID}
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching || reordering}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search testimonials…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "testimonial" : "testimonials"}
          toolbar={reorderToolbar}
          actions={
            <>
              <TransferMenu
                compact
                type="testimonials"
                queryKey={QK.TESTIMONIALS}
                canExport={can(PERM.TESTIMONIALS_VIEW)}
                canImport={can(PERM.TESTIMONIALS_CREATE)}
              />
              {can(PERM.TESTIMONIALS_CREATE) && (
                <Tooltip label="New testimonial" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New testimonial"
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
            <TestimonialListItem
              row={row}
              slots={slots}
              index={data?.items.indexOf(row) ?? -1}
              drag={canReorder && !reordering ? sort : undefined}
              status={statusControl(row)}
              actions={rowActions(row)}
            />
          )}
          renderCard={(row, slots) => (
            <TestimonialCard row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          empty={
            <EmptyState
              icon={MessageSquareQuote}
              title={filtered ? "No testimonials match" : "No testimonials yet"}
              description={
                filtered ? "Try a different search or filter." : "Add a quote from a happy customer."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="testimonials"
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

      <TestimonialModal
        open={(modal.isCreate && can(PERM.TESTIMONIALS_CREATE)) || (!!editing && canUpdate)}
        testimonial={editing}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
