"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { History, Images, Pencil, Plus, Power, PowerOff, Star, Trash2 } from "lucide-react";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
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
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlDrawer } from "@/app/admin/_hooks/useUrlDrawer";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { useHistoryStore } from "@/app/admin/_store/historyStore";
import { galleriesApi, type Gallery } from "@/app/admin/_lib/api/galleriesApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

import { GalleryDrawer } from "./GalleryDrawer";
import { GalleryKpis, type GalleryKpi } from "./GalleryKpis";
import GalleryModal from "./GalleryModal";
import {
  GalleryCard,
  GalleryCounts,
  GalleryCover,
  GalleryListItem,
  GalleryMenuButton,
  type GalleryMenu,
} from "./GalleryViews";

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

function activeKpi(filters: FilterRule[], legacy: { status: string; featured: string }): GalleryKpi | null {
  if (legacy.status || legacy.featured) {
    if (filters.length) return null;
    if (legacy.status === "active" && !legacy.featured) return "active";
    if (legacy.featured === "true" && !legacy.status) return "featured";
    return null;
  }
  if (!filters.length) return "all";
  if (filters.length > 1) return null;
  const [r] = filters;
  if (r.field === "status" && r.op === "in" && Array.isArray(r.value) && r.value.join() === "active")
    return "active";
  if (r.field === "is_featured" && r.op === "is_true") return "featured";
  if (r.field === "items_count" && r.op === "eq" && r.value === "0") return "empty";
  if (r.field === "youtube_count" && r.op === "gt" && r.value === "0") return "videos";
  if (r.field === "has_cover" && r.op === "is_false") return "no_cover";
  return null;
}

export default function Galleries() {
  const can = usePermissions();
  const openHistory = useHistoryStore((s) => s.open);
  const list = useUrlListState({ filterKeys: ["status", "featured"], defaultPerPage: 24 });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const drawer = useUrlDrawer();
  const selection = useBulkSelection();
  const actions = useListActions({
    api: galleriesApi,
    queryKey: QK.GALLERIES,
    noun: "gallery",
    selection,
    softDelete: false,
  });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.GALLERIES, params],
    queryFn: ({ signal }) => galleriesApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.GALLERIES, "stats"], queryFn: galleriesApi.stats });
  const inPage = data?.items.find((g) => g.id === modal.editId);
  const { data: fetched } = useQuery({
    queryKey: [QK.GALLERIES, "detail", modal.editId],
    queryFn: () => galleriesApi.get(modal.editId!),
    enabled: !!modal.editId && !!data && !inPage,
  });

  if (!can(PERM.GALLERIES_VIEW)) return <AccessDenied />;

  const canCreate = can(PERM.GALLERIES_CREATE);
  const canUpdate = can(PERM.GALLERIES_UPDATE);
  const canDelete = can(PERM.GALLERIES_DELETE);
  const editing = modal.editId ? (inPage ?? fetched ?? null) : null;
  const filtered = list.hasFilters || grid.filters.length > 0;
  const active = activeKpi(grid.filters, list.filters);

  const selectKpi = (kpi: GalleryKpi) => {
    selection.clear();
    const reset = { status: null, featured: null, search: null };
    if (kpi === "all" || kpi === active) return grid.setFiltersWith([], reset);
    const rules: Record<Exclude<GalleryKpi, "all">, FilterRule> = {
      active: rule("status", "in", ["active"]),
      featured: rule("is_featured", "is_true"),
      empty: rule("items_count", "eq", "0"),
      videos: rule("youtube_count", "gt", "0"),
      no_cover: rule("has_cover", "is_false"),
    };
    grid.setFiltersWith([rules[kpi]], reset);
  };

  const menu = (g: Gallery): GalleryMenu => [
    { label: "Manage items", icon: Images, onClick: () => drawer.open(g.id) },
    { label: "Edit details", icon: Pencil, onClick: () => modal.openEdit(g.id), hidden: !canUpdate },
    {
      label: g.status === "active" ? "Deactivate" : "Activate",
      icon: Power,
      onClick: () => actions.toggle(g.id),
      hidden: !canUpdate,
    },
    {
      label: "History",
      icon: History,
      onClick: () => openHistory({ type: "gallery", id: g.id, label: g.title }),
      hidden: !can(PERM.ACTIVITY_LOGS_VIEW),
    },
    "divider",
    {
      label: "Delete",
      icon: Trash2,
      danger: true,
      onClick: () => actions.remove(g.id, g.title),
      hidden: !canDelete,
    },
  ];

  const columns: GridColumn<Gallery>[] = [
    {
      id: "title",
      header: "Gallery",
      type: "text",
      size: 300,
      alwaysVisible: true,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <GalleryCover src={row.cover_image} className="h-9 w-12 rounded-md" />
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Link
                href={drawer.href(row.id)}
                scroll={false}
                className="text-fg hover:text-primary truncate font-semibold hover:underline"
              >
                {row.title}
              </Link>
              {row.is_featured && (
                <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />
              )}
            </span>
            <p className="text-fg-subtle truncate text-xs">/{row.slug}</p>
          </div>
        </div>
      ),
    },
    {
      id: "items_count",
      header: "Items",
      type: "number",
      size: 120,
      cell: (row) => <GalleryCounts row={row} />,
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 110,
      options: STATUS_OPTIONS,
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "is_featured",
      header: "Featured",
      type: "bool",
      size: 100,
      cell: (row) => (row.is_featured ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "event_date",
      header: "Event date",
      type: "date",
      size: 130,
      cell: (row) =>
        row.event_date ? <span className="whitespace-nowrap">{formatDate(row.event_date)}</span> : muted,
    },
    {
      id: "image_count",
      header: "Photos",
      type: "number",
      size: 90,
      align: "right",
      defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{row.image_count}</span>,
    },
    {
      id: "youtube_count",
      header: "Videos",
      type: "number",
      size: 90,
      align: "right",
      defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{row.youtube_count}</span>,
    },
    {
      id: "description",
      header: "Description",
      type: "text",
      sortable: false,
      size: 260,
      defaultHidden: true,
      cell: (row) => <span className="text-fg-subtle">{row.description || "—"}</span>,
    },
    {
      id: "has_cover",
      header: "Has cover",
      type: "bool",
      sortable: false,
      size: 100,
      defaultHidden: true,
      cell: (row) => (row.cover_image ? "Yes" : <span className="text-danger">No</span>),
    },
    {
      id: "sort_order",
      header: "Order",
      type: "number",
      size: 80,
      align: "right",
      defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{row.sort_order}</span>,
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
      id: "actions",
      header: "Actions",
      sortable: false,
      size: 70,
      align: "right",
      cell: (row) => <GalleryMenuButton title={row.title} menu={menu(row)} />,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Galleries</h1>
      <GalleryKpis stats={stats} active={active} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="galleries"
          defaultView="cards"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search galleries…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "gallery" : "galleries"}
          actions={
            canCreate && (
              <Tooltip label="New gallery" align="end">
                <Button
                  iconOnly
                  leftIcon={Plus}
                  aria-label="New gallery"
                  onClick={modal.openCreate}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={(row) => drawer.open(row.id)}
          highlightId={drawer.id ?? modal.focusId}
          renderListItem={(row, slots) => (
            <GalleryListItem row={row} slots={slots} href={drawer.href(row.id)} menu={menu(row)} />
          )}
          renderCard={(row, slots) => (
            <GalleryCard row={row} slots={slots} href={drawer.href(row.id)} menu={menu(row)} />
          )}
          empty={
            <EmptyState
              icon={Images}
              title={filtered ? "No galleries match your filters" : "No galleries yet"}
              description={
                filtered ? "Try a different search or filter." : "Create an album and start adding photos."
              }
              action={
                !filtered &&
                canCreate && (
                  <Button leftIcon={Plus} onClick={modal.openCreate}>
                    New gallery
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
              unit="galleries"
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

      <GalleryModal
        key={`modal-${modal.isOpen ? (editing?.id ?? "new") : "closed"}`}
        open={(modal.isCreate && canCreate) || (!!editing && canUpdate)}
        gallery={editing}
        onClose={modal.close}
        onSaved={(saved) => {
          actions.refresh();
          if (editing) modal.close();
          else drawer.replace(saved.id, ["action", "id"]);
        }}
      />

      <GalleryDrawer key={`drawer-${drawer.id ?? "closed"}`} id={drawer.id} onClose={drawer.close} />
    </>
  );
}
