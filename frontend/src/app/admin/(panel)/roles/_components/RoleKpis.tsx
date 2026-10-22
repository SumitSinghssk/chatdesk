"use client";

import { KeyRound, Lock, ShieldCheck, ShieldPlus, UserRoundX, UsersRound } from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import type { Role } from "@/app/admin/_lib/api/rolesApi";

export type RoleKpi = "all" | "custom" | "two_factor" | "in_use" | "unused" | "permissions";

export function RoleKpis({
  roles,
  permissionCount,
  showPermissions,
  active,
  onSelect,
}: {
  roles: Role[] | undefined;
  permissionCount: number | undefined;
  showPermissions: boolean;
  active: RoleKpi | null;
  onSelect: (kpi: RoleKpi) => void;
}) {
  const n = (test: (r: Role) => boolean) => roles?.filter(test).length;
  const users = roles?.reduce((sum, r) => sum + (r.users_count ?? 0), 0);
  const unused = n((r) => !r.users_count);
  return (
    <KpiGrid>
      <KpiTile
        icon={ShieldCheck}
        label="Roles"
        value={roles?.length}
        hint={roles && `${n((r) => r.is_system)} system`}
        active={active === "all"}
        onClick={() => onSelect("all")}
      />
      <KpiTile
        icon={ShieldPlus}
        tone="blue"
        label="Custom roles"
        value={n((r) => !r.is_system)}
        hint="Editable"
        active={active === "custom"}
        onClick={() => onSelect("custom")}
      />
      <KpiTile
        icon={Lock}
        tone="purple"
        label="Require 2FA"
        value={n((r) => r.requires_two_factor)}
        hint="Two-factor sign-in enforced"
        active={active === "two_factor"}
        onClick={() => onSelect("two_factor")}
      />
      <KpiTile
        icon={UsersRound}
        tone="green"
        label="In use"
        value={n((r) => !!r.users_count)}
        hint={users !== undefined && `${users} user${users === 1 ? "" : "s"} assigned`}
        active={active === "in_use"}
        onClick={() => onSelect("in_use")}
      />
      <KpiTile
        icon={UserRoundX}
        tone={unused ? "amber" : "slate"}
        label="Unused"
        value={unused}
        hint="No users yet"
        active={active === "unused"}
        onClick={() => onSelect("unused")}
      />
      <KpiTile
        icon={KeyRound}
        tone="slate"
        label="Permissions"
        value={permissionCount}
        hint={showPermissions ? "View all permissions" : "Defined in the app"}
        active={active === "permissions"}
        onClick={showPermissions ? () => onSelect("permissions") : undefined}
      />
    </KpiGrid>
  );
}
