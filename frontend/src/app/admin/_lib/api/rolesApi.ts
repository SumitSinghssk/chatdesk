import { createCrudApi, getList, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ListParams } from "./types";

export interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  requires_two_factor: boolean;
  permissions: string[];
  permission_ids: number[];
  users_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface RolePayload {
  name: string;
  description?: string | null;
  requires_two_factor: boolean;
  permission_ids: number[];
}

export interface Permission {
  id: number;
  name: string;
  group: string;
  description: string | null;
  roles_count: number | null;
  is_builtin: boolean;
  created_at: string;
}

export interface PermissionGroup {
  group: string;
  permissions: Permission[];
}

export interface PermissionPayload {
  name: string;
  group?: string | null;
  description?: string | null;
}

const R = ADMIN_ENDPOINTS.ROLES;
const P = ADMIN_ENDPOINTS.PERMISSIONS;

export const rolesApi = {
  ...createCrudApi<Role, RolePayload>(R),
  togglePermission: (id: number, permissionId: number) =>
    send<{ permission_id: number; attached: boolean; role: Role }>("post", R.TOGGLE_PERMISSION(id), {
      permission_id: permissionId,
    }),
};

export const permissionsApi = {
  page: (params: ListParams, signal?: AbortSignal) => getPage<Permission>(P.LIST, params, signal),
  grouped: () => getList<PermissionGroup>(P.GROUPED),
  create: (payload: PermissionPayload) => send<Permission>("post", P.CREATE, payload),
  remove: (id: number) => send<null>("delete", P.DELETE(id)),
};

export function roleLabel(name: string) {
  const text = name.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
