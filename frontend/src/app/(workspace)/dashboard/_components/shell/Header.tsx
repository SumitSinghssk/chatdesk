"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";

import { Tooltip } from "@/app/admin/_components/ui/index";
import { headerButton } from "@/app/admin/(panel)/_components/shell/headerStyles";
import { useThemeStore } from "@/app/admin/_store/themeStore";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { WORKSPACE_QK, whatsappApi } from "../../_lib/whatsappApi";
import { UserMenu } from "./UserMenu";

// Mirrors app/admin/(panel)/_components/shell/Header.tsx. The admin "Create" menu becomes a
// WhatsApp status chip, the most important state for a business.

function WhatsAppStatus() {
  const { data } = useQuery({
    queryKey: WORKSPACE_QK.CONNECTION,
    queryFn: async () => (await whatsappApi.connection()).data,
    staleTime: 60_000,
  });
  if (data === undefined) return null;
  const state = !data ? "none" : data.status === "connected" ? "ok" : "error";
  const label = {
    ok: data?.display_phone_number ?? "WhatsApp connected",
    error: "Fix WhatsApp",
    none: "Connect WhatsApp",
  }[state];
  return (
    <Tooltip label={state === "ok" ? "WhatsApp number connected" : "Open WhatsApp setup"} align="end">
      <Link
        href={CUSTOMER_ROUTES.WHATSAPP()}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold shadow-xs transition sm:px-2.5",
          state === "ok" && "border-line text-fg hover:bg-hover border",
          state === "error" && "bg-danger-soft text-danger hover:bg-danger/15",
          state === "none" && "bg-primary text-primary-fg hover:bg-primary-hover"
        )}
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            state === "ok" && "bg-emerald-500",
            state === "error" && "bg-red-500",
            state === "none" && "bg-white/90"
          )}
          aria-hidden
        />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    </Tooltip>
  );
}

export function Header({
  onOpenMobile,
  onOpenSearch,
  onToggleSidebar,
  sidebarCollapsed,
  onSignOut,
}: {
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
        <WhatsAppStatus />
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
