import type { ReactNode } from "react";
import { KeyRound, Lock, ShieldCheck, Users } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge } from "@/app/admin/_components/ui/index";
import { roleLabel, type Role } from "@/app/admin/_lib/api/rolesApi";

function RoleIcon({ row, size = "h-9 w-9" }: { row: Role; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${size} ${
        row.is_system
          ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
          : "bg-primary-soft text-primary"
      }`}
    >
      {row.is_system ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
    </span>
  );
}

export function permissionsLabel(row: Role, total?: number) {
  if (row.is_system) return "All permissions";
  return `${row.permission_ids.length}${total ? ` / ${total}` : ""} permissions`;
}

export function RoleListItem({
  row,
  totalPermissions,
  users,
  twoFactor,
  actions,
}: {
  row: Role;
  slots: RowSlots;
  totalPermissions?: number;
  users: ReactNode;
  twoFactor: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <RoleIcon row={row} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-fg truncate font-semibold">{roleLabel(row.name)}</span>
          {row.is_system && <Badge tone="purple">System</Badge>}
        </p>
        <p className="text-fg-subtle truncate text-xs">
          {row.description || <span className="font-mono">{row.name}</span>}
          <span className="hidden sm:inline"> · {permissionsLabel(row, totalPermissions)}</span>
        </p>
      </div>
      <span className="text-fg-subtle hidden items-center gap-1 text-xs sm:inline-flex">
        <Users className="h-3.5 w-3.5" />
        {users}
      </span>
      <span className="shrink-0">{twoFactor}</span>
      <span className="hidden shrink-0 sm:block">{actions}</span>
    </div>
  );
}

export function RoleCard({
  row,
  totalPermissions,
  users,
  twoFactor,
  actions,
}: {
  row: Role;
  slots: RowSlots;
  totalPermissions?: number;
  users: ReactNode;
  twoFactor: ReactNode;
  actions: ReactNode;
}) {
  const share = row.is_system ? 1 : totalPermissions ? row.permission_ids.length / totalPermissions : 0;
  return (
    <>
      <div className="flex items-start gap-3">
        <RoleIcon row={row} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-fg truncate font-semibold">{roleLabel(row.name)}</span>
            {row.is_system && <Badge tone="purple">System</Badge>}
          </p>
          <p className="text-fg-faint truncate font-mono text-[11px]">{row.name}</p>
        </div>
      </div>

      <p className="text-fg-subtle mt-3 line-clamp-2 min-h-[2.5em] text-sm">
        {row.description || "No description"}
      </p>

      <div className="mt-3 mb-4">
        <div className="text-fg-subtle mb-1 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1">
            <KeyRound className="h-3.5 w-3.5" />
            {permissionsLabel(row, totalPermissions)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {users}
          </span>
        </div>
        <div className="bg-page h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>

      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-fg-subtle inline-flex items-center gap-2 text-xs">
          {twoFactor}
          <span>Requires 2FA</span>
        </span>
        {actions}
      </div>
    </>
  );
}
