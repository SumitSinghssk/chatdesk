"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Settings, ShieldCheck, UserCircle } from "lucide-react";

import { Avatar } from "@/app/admin/_components/ui/index";
import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { logout } from "@/app/admin/_lib/api/authApi";
import { PERM } from "@/config/permissions";
import { useCan } from "@/app/admin/_hooks/usePermissions";
import { cn, titleCase } from "@/lib/utils";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { ADMIN_ROUTES } from "@/config/routes";
const item =
  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-fg-muted transition hover:bg-hover hover:text-fg";

export function UserMenu({
  collapsed = false,
  variant = "sidebar",
}: {
  collapsed?: boolean;
  variant?: "sidebar" | "header";
}) {
  const inHeader = variant === "header";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const canSettings = useCan(PERM.SETTINGS_VIEW);

  const signOut = async () => {
    try {
      await logout();
    } catch {}
    clear();
    router.replace(ADMIN_ROUTES.LOGIN());
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          inHeader
            ? "hover:bg-hover flex items-center gap-2 rounded-lg p-1 pr-1.5 text-left transition"
            : "border-line bg-surface hover:border-line-strong flex w-full items-center gap-2.5 rounded-xl border p-1.5 text-left shadow-xs transition",
          !inHeader && collapsed && "lg:justify-center lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        )}
      >
        <Avatar name={user?.name} src={user?.avatar} size={inHeader ? 28 : 32} />
        <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden", inHeader && "hidden xl:block")}>
          <span className="text-fg block truncate text-xs font-semibold">{user?.name}</span>
          <span className="text-fg-subtle block truncate text-[11px]">
            {user?.role ? titleCase(user.role.name) : "Administrator"}
          </span>
        </span>
        <ChevronsUpDown
          className={cn("text-fg-faint h-4 w-4", collapsed && "lg:hidden", inHeader && "hidden xl:block")}
        />
      </button>

      {open && (
        <div
          className={cn(
            "border-line bg-surface absolute z-100 w-60 rounded-xl border p-1.5 shadow-xl",
            inHeader ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2"
          )}
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user?.name} src={user?.avatar} size={36} />
            <div className="min-w-0">
              <p className="text-fg truncate text-sm font-semibold">{user?.name}</p>
              <p className="text-fg-subtle truncate text-xs">{user?.email}</p>
            </div>
          </div>
          <div className="bg-line my-1 h-px" />
          <Link href={ADMIN_ROUTES.PROFILE()} className={item} onClick={() => setOpen(false)}>
            <UserCircle className="text-fg-faint h-4 w-4" /> My profile
          </Link>
          <Link
            href={ADMIN_ROUTES.PROFILE({ tab: "security" })}
            className={item}
            onClick={() => setOpen(false)}
          >
            <ShieldCheck className="text-fg-faint h-4 w-4" />
            <span className="flex-1">Two-factor sign-in</span>
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold",
                user?.two_factor_enabled ? "bg-success-soft text-success" : "bg-hover text-fg-subtle"
              )}
            >
              {user?.two_factor_enabled ? "On" : "Off"}
            </span>
          </Link>
          {canSettings && (
            <Link href={ADMIN_ROUTES.SETTINGS()} className={item} onClick={() => setOpen(false)}>
              <Settings className="text-fg-faint h-4 w-4" /> Settings
            </Link>
          )}
          <div className="bg-line my-1 h-px" />
          <button
            type="button"
            onClick={signOut}
            className={cn(item, "text-danger hover:bg-danger-soft hover:text-danger font-medium")}
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
