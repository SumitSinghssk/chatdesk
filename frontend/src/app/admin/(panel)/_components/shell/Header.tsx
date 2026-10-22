"use client";

import Link from "next/link";
import {
  ChevronDown,
  Construction,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
} from "lucide-react";

import { Dropdown, Tooltip } from "@/app/admin/_components/ui/index";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { useThemeStore } from "@/app/admin/_store/themeStore";
import { quickCreate } from "@/config/navigation";
import { ADMIN_ROUTES } from "@/config/routes";
import { useSiteName } from "@/app/admin/_hooks/useSiteName";
import { cn } from "@/lib/utils";

import { headerButton } from "./headerStyles";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import type { useWorkspace } from "./useWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Header({
  onOpenMobile,
  onOpenSearch,
  onToggleSidebar,
  sidebarCollapsed,
  maintenance,
  workspace,
}: {
  onOpenMobile: () => void;
  onOpenSearch: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  maintenance?: boolean;
  workspace: ReturnType<typeof useWorkspace>;
}) {
  const siteName = useSiteName();
  const can = usePermissions();
  const { mode, toggle } = useThemeStore();
  const creatable = quickCreate.filter(
    (c) => (!c.workspace || c.workspace === workspace.current) && can(c.permission)
  );

  return (
    <header className="border-line bg-surface relative z-40 flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenMobile}
          className={cn(headerButton, "lg:hidden")}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Tooltip label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} align="start">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cn(headerButton, "hidden lg:inline-flex")}
            aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" />
            )}
          </button>
        </Tooltip>
        <Link
          href={ADMIN_ROUTES.DASHBOARD()}
          className="flex min-w-0 items-center gap-2 pr-1"
          title={siteName}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-sm">
            {siteName.charAt(0)}
          </span>
          <span className="text-fg hidden truncate text-sm font-semibold md:inline">{siteName}</span>
        </Link>
        <span className="bg-line mx-1 hidden h-5 w-px sm:block" />
        <WorkspaceSwitcher workspace={workspace} />
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Tooltip label="Search (Ctrl K)" align="end">
          <button type="button" onClick={onOpenSearch} className={headerButton} aria-label="Search">
            <Search className="h-4.5 w-4.5" />
          </button>
        </Tooltip>

        {maintenance && (
          <Tooltip label="Maintenance mode is on" align="end">
            <Link
              href={ADMIN_ROUTES.SETTINGS({ tab: "maintenance" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-400 px-2 text-xs font-semibold text-amber-950 shadow-xs transition hover:bg-amber-300"
            >
              <Construction className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Maintenance</span>
            </Link>
          </Tooltip>
        )}

        {creatable.length > 0 && (
          <Dropdown
            width="w-56"
            header={<p className="text-fg-faint px-2 pt-1 pb-1.5 text-[11px] font-medium">Create new</p>}
            trigger={() => (
              <button
                type="button"
                aria-label="Create new"
                className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold shadow-xs transition sm:px-2.5"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create</span>
                <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 sm:block" />
              </button>
            )}
            items={creatable.map((c) => ({ label: c.label, href: c.href, icon: c.icon }))}
          />
        )}

        <Tooltip label={mode === "dark" ? "Light theme" : "Dark theme"} align="end">
          <button type="button" onClick={toggle} className={headerButton} aria-label="Toggle dark mode">
            {mode === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>
        </Tooltip>
        <NotificationBell />
        <span className="bg-line mx-1 hidden h-5 w-px sm:block" />
        <UserMenu variant="header" />
      </div>
    </header>
  );
}
