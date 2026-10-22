"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Badge,
  Button,
  Card,
  EmptyState,
  Pagination,
  RowActions,
  Switch,
  Tabs,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { permissionsApi, roleLabel, rolesApi, type Role } from "@/app/admin/_lib/api/rolesApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo } from "@/lib/utils";

import RoleModal from "./RoleModal";
import { RoleKpis, type RoleKpi } from "./RoleKpis";
import { RoleCard, RoleListItem } from "./RoleViews";
import { PermissionMatrix } from "./PermissionMatrix";
import { PermissionsTab } from "./PermissionsTab";

import { ADMIN_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
type Tab = "roles" | "matrix" | "permissions";

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

const KPI_RULES: Record<Exclude<RoleKpi, "permissions">, FilterRule[]> = {
  all: [],
  custom: [rule("is_system", "is_false")],
  two_factor: [rule("requires_two_factor", "is_true")],
  in_use: [rule("users", "gt", "0")],
  unused: [rule("users", "eq", "0")],
};

function activeKpi(tab: Tab, filters: FilterRule[]): RoleKpi | null {
  if (tab === "permissions") return "permissions";
  if (tab !== "roles") return null;
  const key = JSON.stringify(filters.map(({ field, op, value }) => [field, op, value]));
  const hit = (Object.keys(KPI_RULES) as (keyof typeof KPI_RULES)[]).find(
    (k) => JSON.stringify(KPI_RULES[k].map(({ field, op, value }) => [field, op, value])) === key
  );
  return hit ?? null;
}

export default function Roles() {
  const can = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: [] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const actions = useListActions({ api: rolesApi, queryKey: QK.ROLES, noun: "role", softDelete: false });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.ROLES, params],
    queryFn: ({ signal }) => rolesApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: roles, isLoading: allLoading } = useQuery({
    queryKey: [QK.ROLES, "all"],
    queryFn: () => rolesApi.all(),
  });
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: [QK.PERMISSIONS, "grouped"],
    queryFn: permissionsApi.grouped,
    staleTime: 60_000,
  });

  if (!can(PERM.ROLES_VIEW)) return <AccessDenied />;

  const canCreate = can(PERM.ROLES_CREATE);
  const canUpdate = can(PERM.ROLES_UPDATE);
  const canDelete = can(PERM.ROLES_DELETE);
  const canSeePermissions = can([PERM.PERMISSIONS_VIEW, PERM.ROLES_VIEW]);
  const raw = searchParams.get("tab");
  const tab: Tab = raw === "matrix" || (raw === "permissions" && canSeePermissions) ? raw : "roles";
  const setTab = (next: Tab) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "roles") sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const editing = modal.editId ? (roles?.find((r) => r.id === modal.editId) ?? null) : null;
  const permissionCount = groups?.reduce((n, g) => n + g.permissions.length, 0);
  const filtered = list.hasFilters || grid.filters.length > 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [QK.ROLES] });
    queryClient.invalidateQueries({ queryKey: [QK.PERMISSIONS] });
  };

  const selectKpi = (kpi: RoleKpi) => {
    if (kpi === "permissions") return setTab("permissions");
    grid.setFiltersWith(KPI_RULES[kpi], { tab: null, search: null });
  };

  const toggleTwoFactor = async (role: Role) => {
    try {
      const res = await rolesApi.update(role.id, {
        name: role.name,
        description: role.description,
        requires_two_factor: !role.requires_two_factor,
        permission_ids: role.permission_ids,
      });
      toast.success(
        res.data.requires_two_factor ? "Two-factor sign-in is now required" : "Two-factor requirement removed"
      );
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update role"));
    }
  };

  const usersCell = (row: Role) =>
    can(PERM.USERS_VIEW) && row.users_count ? (
      <Button variant="link" size="sm" href={ADMIN_ROUTES.USERS({ role_id: row.id })}>
        {row.users_count}
      </Button>
    ) : (
      (row.users_count ?? 0)
    );

  const twoFactorCell = (row: Role) =>
    canUpdate ? (
      <Switch
        size="sm"
        checked={row.requires_two_factor}
        onChange={() => toggleTwoFactor(row)}
        aria-label={`Require two-factor sign-in for ${roleLabel(row.name)}`}
      />
    ) : row.requires_two_factor ? (
      <Badge tone="green">Required</Badge>
    ) : (
      <span className="text-fg-subtle">No</span>
    );

  const rowActions = (row: Role) => (
    <RowActions
      history={{ type: "role", id: row.id, label: roleLabel(row.name) }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete && !row.is_system ? () => actions.remove(row.id, roleLabel(row.name)) : undefined}
    />
  );

  const columns: GridColumn<Role>[] = [
    {
      id: "name",
      header: "Role",
      type: "text",
      size: 220,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-fg truncate font-semibold">{roleLabel(row.name)}</span>
          {row.is_system && (
            <Badge tone="purple">
              <Lock size={10} aria-hidden /> System
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: "description",
      header: "Description",
      type: "text",
      size: 280,
      cell: (row) => row.description || <span className="text-fg-faint font-mono text-xs">{row.name}</span>,
    },
    {
      id: "permissions",
      header: "Permissions",
      type: "number",
      size: 130,
      align: "right",
      cell: (row) =>
        row.is_system
          ? "All"
          : `${row.permission_ids.length}${permissionCount ? ` / ${permissionCount}` : ""}`,
    },
    { id: "users", header: "Users", type: "number", size: 100, align: "right", cell: usersCell },
    {
      id: "requires_two_factor",
      header: "Requires 2FA",
      type: "bool",
      size: 130,
      cell: twoFactorCell,
    },
    {
      id: "is_system",
      header: "Type",
      type: "bool",
      size: 110,
      defaultHidden: true,
      cell: (row) => (row.is_system ? "System" : "Custom"),
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
      <h1 className="sr-only">Roles &amp; permissions</h1>
      <RoleKpis
        roles={roles}
        permissionCount={permissionCount}
        showPermissions={canSeePermissions}
        active={activeKpi(tab, grid.filters)}
        onSelect={selectKpi}
      />

      <Card>
        <Tabs<Tab>
          className="px-3 pt-1"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "roles", label: "Roles", count: roles?.length },
            { value: "matrix", label: "Permission matrix" },
            ...(canSeePermissions
              ? [{ value: "permissions" as const, label: "Permissions", count: permissionCount }]
              : []),
          ]}
        />
        {tab === "roles" && (
          <DataGrid
            id="roles"
            columns={columns}
            rows={data?.items}
            getRowId={(r) => r.id}
            loading={isLoading}
            fetching={isFetching}
            grid={grid}
            search={list.searchInput}
            onSearch={list.setSearchInput}
            searchPlaceholder="Search roles…"
            count={data?.meta.total}
            countLabel={data?.meta.total === 1 ? "role" : "roles"}
            actions={
              canCreate && (
                <Tooltip label="New role" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New role"
                    onClick={modal.openCreate}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )
            }
            onRowClick={canUpdate ? (row) => modal.openEdit(row.id) : undefined}
            highlightId={modal.focusId ?? modal.editId}
            defaultView="cards"
            renderListItem={(row, slots) => (
              <RoleListItem
                row={row}
                slots={slots}
                totalPermissions={permissionCount}
                users={usersCell(row)}
                twoFactor={twoFactorCell(row)}
                actions={rowActions(row)}
              />
            )}
            renderCard={(row, slots) => (
              <RoleCard
                row={row}
                slots={slots}
                totalPermissions={permissionCount}
                users={usersCell(row)}
                twoFactor={twoFactorCell(row)}
                actions={rowActions(row)}
              />
            )}
            empty={
              <EmptyState
                icon={ShieldCheck}
                title={filtered ? "No roles match" : "No roles yet"}
                description={
                  filtered ? "Try a different search or filter." : "Create a role to group permissions."
                }
              />
            }
            footer={
              <Pagination
                meta={data?.meta}
                onPageChange={list.setPage}
                onPerPageChange={list.setPerPage}
                unit="roles"
              />
            }
          />
        )}
        {tab === "matrix" && (
          <>
            <p className="border-line text-fg-subtle border-b px-4 py-3 text-xs">
              {canUpdate
                ? "Tick a box to grant or revoke a permission. Members of the role are signed out so the change applies immediately."
                : "Read-only view. You need the roles.update permission to change grants."}
            </p>
            <PermissionMatrix
              roles={roles ?? []}
              groups={groups}
              loading={allLoading || groupsLoading}
              canUpdate={canUpdate}
            />
          </>
        )}
        {tab === "permissions" && (
          <PermissionsTab
            groups={groups}
            canCreate={can(PERM.PERMISSIONS_CREATE)}
            canDelete={can(PERM.PERMISSIONS_DELETE)}
          />
        )}
      </Card>

      <RoleModal
        open={modal.isCreate || !!editing}
        role={editing}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          refresh();
        }}
      />
    </>
  );
}
