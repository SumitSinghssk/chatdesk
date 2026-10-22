"use client";

import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Checkbox, EmptyState, Skeleton } from "@/app/admin/_components/ui/index";
import { roleLabel, rolesApi, type PermissionGroup, type Role } from "@/app/admin/_lib/api/rolesApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";

import { actionLabel } from "./PermissionPicker";

import { QK } from "@/config/query-keys";
export function PermissionMatrix({
  roles,
  groups,
  loading,
  canUpdate,
}: {
  roles: Role[];
  groups: PermissionGroup[] | undefined;
  loading: boolean;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Set<string>>(new Set());

  if (loading || !groups) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (roles.length === 0) return <EmptyState title="No roles yet" />;

  const toggle = async (role: Role, permissionId: number) => {
    const key = `${role.id}:${permissionId}`;
    setPending((prev) => new Set(prev).add(key));
    try {
      const res = await rolesApi.togglePermission(role.id, permissionId);
      queryClient.setQueryData<Role[]>([QK.ROLES, "all"], (prev) =>
        prev?.map((r) => (r.id === role.id ? res.data.role : r))
      );
      queryClient.invalidateQueries({ queryKey: [QK.PERMISSIONS] });
      toast.success(res.message ?? "Saved");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update permission"));
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface sticky top-0 z-10">
          <tr className="border-line border-b">
            <th className="bg-surface text-fg-subtle sticky left-0 z-20 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
              Permission
            </th>
            {roles.map((r) => (
              <th
                key={r.id}
                className="text-fg px-3 py-2.5 text-center text-xs font-semibold whitespace-nowrap"
              >
                {roleLabel(r.name)}
                {r.is_system && (
                  <span className="text-fg-subtle block text-[11px] font-normal">all access</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.group}>
              <tr className="border-line bg-page border-b">
                <td
                  colSpan={roles.length + 1}
                  className="text-fg-muted px-4 py-1.5 text-xs font-semibold tracking-wide uppercase"
                >
                  {g.group}
                </td>
              </tr>
              {g.permissions.map((p) => (
                <tr
                  key={p.id}
                  className="border-line hover:bg-hover/50 border-b transition-colors last:border-0"
                >
                  <td className="bg-surface sticky left-0 px-4 py-2">
                    <span className="text-fg block">{actionLabel(p.name)}</span>
                    <span className="text-fg-subtle block font-mono text-xs">{p.name}</span>
                  </td>
                  {roles.map((r) => {
                    const checked = r.is_system || r.permission_ids.includes(p.id);
                    const busy = pending.has(`${r.id}:${p.id}`);
                    return (
                      <td key={r.id} className="px-3 py-2 text-center">
                        <Checkbox
                          checked={checked}
                          disabled={r.is_system || !canUpdate || busy}
                          onChange={() => toggle(r, p.id)}
                          aria-label={`${roleLabel(r.name)}: ${p.name}`}
                          className="justify-center"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
