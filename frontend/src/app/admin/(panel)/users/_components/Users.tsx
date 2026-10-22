"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Lock, Plus, Power, PowerOff, ShieldCheck, Trash2, Users as UsersIcon } from "lucide-react";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
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
import { useBulkSelection, type BulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlDrawer } from "@/app/admin/_hooks/useUrlDrawer";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { roleLabel, rolesApi } from "@/app/admin/_lib/api/rolesApi";
import { usersApi, type User } from "@/app/admin/_lib/api/usersApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { UserDrawer } from "./UserDrawer";
import { UserKpis, type UserKpi } from "./UserKpis";
import UserModal from "./UserModal";
import { UserCard, UserListItem } from "./UserViews";

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

function activeKpi(filters: FilterRule[], hasOldFilters: boolean): UserKpi | null {
  if (filters.length === 0) return hasOldFilters ? null : "all";
  if (filters.length !== 1) return null;
  const [r] = filters;
  const only = (v: string) => Array.isArray(r.value) && r.value.length === 1 && r.value[0] === v;
  if (r.field === "status" && r.op === "in" && only("active")) return "active";
  if (r.field === "status" && r.op === "in" && only("inactive")) return "inactive";
  if (r.op !== "is_true") return null;
  if (r.field === "locked") return "locked";
  if (r.field === "two_factor") return "two_factor";
  if (r.field === "online") return "online";
  return null;
}

export default function Users() {
  const can = usePermissions();
  const queryClient = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id);
  const list = useUrlListState({ filterKeys: ["status", "role_id", "locked"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const drawer = useUrlDrawer();
  const selection = useBulkSelection();
  const actions = useListActions({ api: usersApi, queryKey: QK.USERS, noun: "user", selection });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.USERS, params],
    queryFn: ({ signal }) => usersApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.USERS, "stats"], queryFn: usersApi.stats });
  const { data: roles = [] } = useQuery({ queryKey: [QK.ROLES, "all"], queryFn: () => rolesApi.all() });
  const editing = useQuery({
    queryKey: [QK.USERS, "detail", modal.editId],
    queryFn: () => usersApi.detail(modal.editId!),
    enabled: !!modal.editId,
  });

  if (!can(PERM.USERS_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.USERS_UPDATE);
  const canDelete = can(PERM.USERS_DELETE);
  const filtered = list.hasFilters || grid.filters.length > 0;

  const bulkSelection: BulkSelection = {
    ...selection,
    toggle: (id) => {
      if (id !== meId) selection.toggle(id);
    },
    togglePage: (ids) => selection.togglePage(ids.filter((id) => id !== meId)),
    pageState: (ids) => selection.pageState(ids.filter((id) => id !== meId)),
  };

  const selectKpi = (kpi: UserKpi) => {
    selection.clear();
    const reset = { status: null, role_id: null, locked: null, search: null };
    const rules: Record<UserKpi, FilterRule[]> = {
      all: [],
      active: [rule("status", "in", ["active"])],
      inactive: [rule("status", "in", ["inactive"])],
      locked: [rule("locked", "is_true")],
      two_factor: [rule("two_factor", "is_true")],
      online: [rule("online", "is_true")],
    };
    grid.setFiltersWith(rules[kpi], reset);
  };

  const statusControl = (row: User) =>
    canUpdate && row.id !== meId ? (
      <Switch
        size="sm"
        checked={row.status === "active"}
        onChange={() => actions.toggle(row.id)}
        aria-label={`Toggle status for ${row.name}`}
      />
    ) : (
      <StatusBadge status={row.status} />
    );

  const rowActions = (row: User) => (
    <RowActions
      history={{ type: "user", id: row.id, label: row.name }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete && row.id !== meId ? () => actions.remove(row.id, row.name) : undefined}
    >
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        leftIcon={Eye}
        aria-label="View"
        title="View"
        onClick={() => drawer.open(row.id)}
      />
    </RowActions>
  );

  const columns: GridColumn<User>[] = [
    {
      id: "name",
      header: "User",
      type: "text",
      size: 250,
      alwaysVisible: true,
      cell: (row) => (
        <Link href={drawer.href(row.id)} scroll={false} className="group flex min-w-0 items-center gap-2.5">
          <span className="relative shrink-0">
            <Avatar name={row.name} src={row.avatar} size={26} />
            {row.is_online && (
              <span
                className="bg-success ring-surface absolute right-0 bottom-0 h-2 w-2 rounded-full ring-2"
                title="Online now"
              />
            )}
          </span>
          <span className="text-fg group-hover:text-primary truncate font-medium">{row.name}</span>
          {row.id === meId && <Badge tone="blue">You</Badge>}
          {row.is_locked && (
            <Badge tone="red">
              <Lock size={10} aria-hidden /> Locked
            </Badge>
          )}
        </Link>
      ),
    },
    { id: "email", header: "Email", type: "text", size: 230, cell: (row) => row.email },
    {
      id: "phone",
      header: "Phone",
      type: "text",
      size: 140,
      defaultHidden: true,
      cell: (row) => row.phone || muted,
    },
    {
      id: "role",
      header: "Role",
      type: "enum",
      size: 150,
      options: roles.map((r) => ({ value: String(r.id), label: roleLabel(r.name) })),
      cell: (row) => (row.role ? roleLabel(row.role.name) : <span className="text-fg-faint">No role</span>),
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
      id: "two_factor",
      header: "2FA",
      type: "bool",
      sortable: false,
      size: 90,
      cell: (row) =>
        row.two_factor_enabled ? (
          <Badge tone="green">
            <ShieldCheck size={10} aria-hidden /> On
          </Badge>
        ) : (
          <span className="text-fg-faint">Off</span>
        ),
    },
    {
      id: "locked",
      header: "Locked",
      type: "bool",
      sortable: false,
      size: 100,
      defaultHidden: true,
      cell: (row) =>
        row.is_locked ? (
          <span className="text-danger font-medium" title={`Until ${formatDateTime(row.locked_until)}`}>
            Yes
          </span>
        ) : (
          <span className="text-fg-faint">No</span>
        ),
    },
    {
      id: "online",
      header: "Online",
      type: "bool",
      sortable: false,
      size: 90,
      defaultHidden: true,
      cell: (row) =>
        row.is_online ? (
          <span className="text-success font-medium">Online</span>
        ) : (
          <span className="text-fg-faint">—</span>
        ),
    },
    {
      id: "last_login_at",
      header: "Last login",
      type: "date",
      size: 140,
      cell: (row) => (
        <span title={formatDateTime(row.last_login_at)} className="text-fg-subtle whitespace-nowrap">
          {row.last_login_at ? timeAgo(row.last_login_at) : "Never"}
        </span>
      ),
    },
    {
      id: "failed_logins",
      header: "Failed sign-ins",
      type: "number",
      size: 130,
      align: "right",
      defaultHidden: true,
      cell: (row) => row.failed_logins,
    },
    {
      id: "created_at",
      header: "Created",
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

  return (
    <>
      <h1 className="sr-only">Users</h1>
      <UserKpis stats={stats} active={activeKpi(grid.filters, list.hasFilters)} onSelect={selectKpi} />

      <Card>
        <DataGrid
          id="users"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search name, email or phone…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "user" : "users"}
          actions={
            <>
              <TransferMenu
                compact
                type="users"
                queryKey={QK.USERS}
                canExport={can(PERM.USERS_VIEW)}
                canImport={false}
              />
              {can(PERM.USERS_CREATE) && (
                <Tooltip label="New user" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New user"
                    onClick={modal.openCreate}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canUpdate || canDelete ? bulkSelection : undefined}
          isSelectable={(row) => row.id !== meId}
          onRowClick={(row) => drawer.open(row.id)}
          highlightId={drawer.id ?? modal.focusId}
          renderListItem={(row, slots) => (
            <UserListItem
              row={row}
              slots={slots}
              href={drawer.href(row.id)}
              isMe={row.id === meId}
              status={statusControl(row)}
              actions={rowActions(row)}
            />
          )}
          renderCard={(row, slots) => (
            <UserCard
              row={row}
              slots={slots}
              href={drawer.href(row.id)}
              isMe={row.id === meId}
              status={statusControl(row)}
              actions={rowActions(row)}
            />
          )}
          empty={
            <EmptyState
              icon={UsersIcon}
              title={filtered ? "No users match" : "No users yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Invite your team by creating their accounts."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="users"
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

      <UserDrawer id={drawer.id} onClose={drawer.close} onEdit={modal.openEdit} />

      <UserModal
        open={modal.isCreate || !!modal.editId}
        user={modal.editId ? (editing.data ?? null) : null}
        loading={!!modal.editId && editing.isLoading}
        roles={roles}
        isSelf={!!modal.editId && modal.editId === meId}
        onClose={modal.close}
        onSaved={(saved) => {
          if (saved.id === meId) queryClient.invalidateQueries({ queryKey: [QK.AUTH, "me"] });
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
