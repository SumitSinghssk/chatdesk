"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Plus, Power, PowerOff, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";

import {
  DataGrid,
  ToolbarIconButton,
  useGridPrefs,
  useGridUrlState,
  type FilterRule,
  type GridColumn,
} from "@/app/admin/_components/grid";
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
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { teamApi, type TeamMember } from "@/app/admin/_lib/api/teamApi";
import { PERM } from "@/config/permissions";
import { QK } from "@/config/query-keys";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { TeamKpis, type TeamKpi } from "./TeamKpis";
import TeamMemberModal, { SOCIAL_OPTIONS } from "./TeamMemberModal";
import { TeamCard, TeamListItem } from "./TeamViews";

const GRID_ID = "team";

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

const KPI_RULES: Record<TeamKpi, FilterRule[]> = {
  all: [],
  active: [rule("status", "in", ["active"])],
  inactive: [rule("status", "in", ["inactive"])],
  featured: [rule("is_featured", "is_true")],
  no_photo: [rule("photo", "is_false")],
};

const signature = (rules: FilterRule[]) =>
  JSON.stringify(rules.map(({ field, op, value }) => [field, op, value]));

export default function Team() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status", "department"] });
  const grid = useGridUrlState();
  const [prefs, savePrefs] = useGridPrefs(GRID_ID);
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({ api: teamApi, queryKey: QK.TEAM, noun: "team member", selection });
  const queryClient = useQueryClient();
  const [reordering, setReordering] = useState(false);
  const sort = useDragSort({ onMove: (from, to) => reorder(from, to) });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.TEAM, params],
    queryFn: ({ signal }) => teamApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.TEAM, "stats"], queryFn: teamApi.stats });
  const inPage = data?.items.find((t) => t.id === modal.editId);
  const { data: fetched } = useQuery({
    queryKey: [QK.TEAM, "detail", modal.editId],
    queryFn: () => teamApi.get(modal.editId!),
    enabled: !!modal.editId && !!data && !inPage,
  });

  if (!can(PERM.TEAM_VIEW)) return <AccessDenied />;

  const canCreate = can(PERM.TEAM_CREATE);
  const canUpdate = can(PERM.TEAM_UPDATE);
  const canDelete = can(PERM.TEAM_DELETE);
  const editing = modal.editId ? (inPage ?? fetched ?? null) : null;
  const filtered = list.hasFilters || grid.filters.length > 0;
  const orderIntact = !filtered && grid.sort.length === 0;
  const canReorder = canUpdate && orderIntact;
  const inListView = prefs.view === "list";
  const offset = data ? (data.meta.page - 1) * data.meta.per_page : 0;
  const departments = stats?.departments ?? [];

  const current = signature(grid.filters);
  const activeKpi =
    list.hasFilters && grid.filters.length === 0
      ? null
      : ((Object.keys(KPI_RULES) as TeamKpi[]).find((k) => signature(KPI_RULES[k]) === current) ?? null);

  const selectKpi = (kpi: TeamKpi) => {
    selection.clear();
    grid.setFiltersWith(KPI_RULES[kpi], { status: null, department: null, search: null });
  };

  const reorder = async (from: number, to: number) => {
    const pageItems = data?.items ?? [];
    const moved = pageItems[from];
    if (!moved) return;
    const nextItems = [...pageItems];
    nextItems.splice(to, 0, ...nextItems.splice(from, 1));
    queryClient.setQueryData([QK.TEAM, params], { ...data!, items: nextItems });
    setReordering(true);
    try {
      const ids = (await teamApi.all()).map((t) => t.id);
      const currentIndex = ids.indexOf(moved.id);
      if (currentIndex < 0) return;
      ids.splice(currentIndex, 1);
      ids.splice(offset + to, 0, moved.id);
      await teamApi.reorder(ids);
      await actions.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change the order"));
    } finally {
      setReordering(false);
    }
  };

  const statusControl = (row: TeamMember) =>
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

  const rowActions = (row: TeamMember) => (
    <RowActions
      history={{ type: "team_member", id: row.id, label: row.name }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, row.name) : undefined}
    />
  );

  const columns: GridColumn<TeamMember>[] = [
    {
      id: "name",
      header: "Member",
      type: "text",
      size: 230,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photo} size={28} />
          <span className="text-fg truncate font-medium">{row.name}</span>
        </span>
      ),
    },
    {
      id: "designation",
      header: "Role",
      type: "text",
      size: 180,
      cell: (row) => row.designation || muted,
    },
    {
      id: "department",
      header: "Department",
      type: "enum",
      size: 150,
      options: departments.map((d) => ({ value: d, label: d })),
      cell: (row) => (row.department ? <Badge tone="blue">{row.department}</Badge> : muted),
    },
    {
      id: "bio",
      header: "Bio",
      type: "text",
      sortable: false,
      size: 280,
      defaultHidden: true,
      cell: (row) => <span className="text-fg-muted line-clamp-2">{row.bio || "—"}</span>,
    },
    { id: "email", header: "Email", type: "text", size: 200, cell: (row) => row.email || muted },
    {
      id: "phone",
      header: "Phone",
      type: "text",
      size: 140,
      defaultHidden: true,
      cell: (row) => row.phone || muted,
    },
    {
      id: "social",
      header: "Social",
      sortable: false,
      size: 160,
      defaultHidden: true,
      cell: (row) =>
        row.social_links.length
          ? row.social_links
              .map((l) => SOCIAL_OPTIONS.find((o) => o.value === l.platform)?.label ?? l.platform)
              .join(", ")
          : muted,
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
      id: "actions",
      header: "",
      sortable: false,
      size: 110,
      minSize: 110,
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
      <h1 className="sr-only">Team members</h1>
      <TeamKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

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
          searchPlaceholder="Search name, role, department…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "member" : "members"}
          toolbar={reorderToolbar}
          defaultView="cards"
          actions={
            canCreate && (
              <Tooltip label="New team member" align="end">
                <Button
                  iconOnly
                  leftIcon={Plus}
                  aria-label="New team member"
                  onClick={modal.openCreate}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={canUpdate ? (row) => modal.openEdit(row.id) : undefined}
          highlightId={modal.focusId ?? modal.editId}
          renderListItem={(row, slots) => (
            <TeamListItem
              row={row}
              slots={slots}
              index={data?.items.indexOf(row) ?? -1}
              drag={canReorder && !reordering ? sort : undefined}
              status={statusControl(row)}
              actions={rowActions(row)}
            />
          )}
          renderCard={(row, slots) => (
            <TeamCard row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          empty={
            <EmptyState
              icon={UsersRound}
              title={filtered ? "No team members match" : "No team members yet"}
              description={
                filtered ? "Try a different search or filter." : "Add the people behind your business."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="members"
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

      <TeamMemberModal
        open={(modal.isCreate && canCreate) || (!!editing && canUpdate)}
        member={editing}
        departments={departments}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
