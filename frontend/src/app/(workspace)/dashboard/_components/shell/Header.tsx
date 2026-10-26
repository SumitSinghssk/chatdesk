"use client";

import Link from "next/link";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";

import { headerButton } from "@/app/admin/(panel)/_components/shell/headerStyles";
import { useThemeStore } from "@/app/admin/_store/themeStore";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import type { WaNumber } from "../../_lib/numbersApi";
import { NotificationBell } from "./NotificationBell";
import { NumberSwitcher } from "./NumberSwitcher";
import { UserMenu } from "./UserMenu";
import { Tooltip } from "../Tooltip";

// Mirrors app/admin/(panel)/_components/shell/Header.tsx. The admin "Create" menu becomes the WhatsApp
// number switcher: which number the workspace is on, and whether it's connected.

export function Header({
  numbers,
  number,
  onSwitchNumber,
  onOpenMobile,
  onOpenSearch,
  onToggleSidebar,
  sidebarCollapsed,
  onSignOut,
}: {
  numbers: WaNumber[];
  number: WaNumber;
  onSwitchNumber: (id: number, opts?: { to?: string }) => Promise<void>;
  onOpenMobile: () => void;
  onOpenSearch: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  onSignOut: () => void;
}) {
  const { mode, toggle } = useThemeStore();

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
          href={CUSTOMER_ROUTES.DASHBOARD()}
          className="flex min-w-0 items-center gap-2 pr-1"
          title={siteConfig.name}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-sm">
            {siteConfig.name.charAt(0)}
          </span>
          <span className="text-fg hidden truncate text-sm font-semibold md:inline">{siteConfig.name}</span>
        </Link>
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Tooltip label="Search (Ctrl K)" align="end">
          <button type="button" onClick={onOpenSearch} className={headerButton} aria-label="Search">
            <Search className="h-4.5 w-4.5" />
          </button>
        </Tooltip>
        <NumberSwitcher numbers={numbers} current={number} onSwitch={onSwitchNumber} />
        <NotificationBell className={headerButton} />
        <Tooltip label={mode === "dark" ? "Light theme" : "Dark theme"} align="end">
          <button type="button" onClick={toggle} className={headerButton} aria-label="Toggle dark mode">
            {mode === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>
        </Tooltip>
        <span className="bg-line mx-1 hidden h-5 w-px sm:block" />
        <UserMenu onSignOut={onSignOut} />
      </div>
    </header>
  );
}
