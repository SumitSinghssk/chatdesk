"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { RecordHistoryDrawer } from "@/app/admin/_components/activity";
import { Spinner } from "@/app/admin/_components/ui/index";
import { fetchMe } from "@/app/admin/_lib/api/authApi";
import api, { restoreSession } from "@/app/admin/_lib/api/client";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import { PERM } from "@/config/permissions";
import { useCan } from "@/app/admin/_hooks/usePermissions";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { CommandPalette } from "./shell/CommandPalette";
import { Header } from "./shell/Header";
import { IdleWarning } from "./shell/IdleWarning";
import { Sidebar } from "./shell/Sidebar";
import { TabsBar } from "./shell/TabsBar";
import { useShellPrefs } from "./shell/useShellPrefs";
import { useSidebarResize } from "./shell/useSidebarResize";
import { useWorkspace } from "./shell/useWorkspace";

import { pageFor } from "@/config/navigation";
import { ADMIN_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
const COLLAPSE_KEY = "sk_sidebar_collapsed";

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hydrated, accessToken, user, setUser } = useAuthStore();
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1"
  );
  const [mobileOpenAt, setMobileOpenAt] = useState<string | null>(null);
  const mobileOpen = mobileOpenAt === pathname;
  const setMobileOpen = (open: boolean) => setMobileOpenAt(open ? pathname : null);
  const [searchOpen, setSearchOpen] = useState(false);
  const canSeeEnquiries = useCan(PERM.ENQUIRIES_VIEW);
  const canSeeSettings = useCan(PERM.SETTINGS_VIEW);
  const canSeeHealth = useCan(PERM.SYSTEM_HEALTH_VIEW);
  const workspace = useWorkspace();
  const shell = useShellPrefs();
  const currentWorkspace = workspace.current;
  const searchParams = useSearchParams();
  const pagePath = pageFor(pathname)?.path;
  const search = searchParams.toString();
  const { visit } = shell;
  useEffect(() => {
    if (pagePath && user) visit(currentWorkspace, pagePath, search ? `${pathname}?${search}` : pathname);
  }, [currentWorkspace, pagePath, pathname, search, user, visit]);

  const setCollapsedPersist = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {}
  };
  const resize = useSidebarResize({ collapsed, setCollapsed: setCollapsedPersist });

  useEffect(() => {
    if (!hydrated) void restoreSession();
  }, [hydrated]);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace(ADMIN_ROUTES.LOGIN({ next: pathname }));
  }, [hydrated, accessToken, router, pathname]);

  const me = useQuery({
    queryKey: [QK.AUTH, "me"],
    queryFn: fetchMe,
    enabled: hydrated && !!accessToken,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);

  useEffect(() => {
    if (user?.two_factor_required && !user.two_factor_enabled && pathname !== ADMIN_ROUTES.PROFILE()) {
      router.replace(ADMIN_ROUTES.PROFILE({ tab: "security" }));
    }
  }, [user, pathname, router]);

  const { data: enquiryStats } = useQuery({
    queryKey: [QK.ENQUIRIES, "stats"],
    queryFn: async () =>
      (
        await api.get<{ data: { new: number; unseen: number; follow_up_due: number } }>(
          ADMIN_ENDPOINTS.ENQUIRIES.STATS
        )
      ).data.data,
    enabled: !!accessToken && canSeeEnquiries,
    refetchInterval: 120_000,
  });

  const { data: health } = useQuery({
    queryKey: [QK.SYSTEM_HEALTH, "summary"],
    queryFn: async () =>
      (await api.get<{ data: { errors: number } }>(ADMIN_ENDPOINTS.SYSTEM_HEALTH.SUMMARY)).data.data,
    enabled: !!accessToken && canSeeHealth,
    staleTime: 300_000,
    retry: false,
  });

  const { data: maintenance } = useQuery({
    queryKey: [QK.SETTINGS, "maintenance"],
    queryFn: async () =>
      (await api.get<{ data: { enabled: boolean } }>(ADMIN_ENDPOINTS.SETTINGS.GROUP("maintenance"))).data
        .data,
    enabled: !!accessToken && canSeeSettings,
    staleTime: 300_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => setCollapsedPersist(!collapsed);

  if (!hydrated || !accessToken || !user) {
    return (
      <div className="admin-theme bg-canvas min-h-screen">
        <Spinner className="min-h-screen" />
      </div>
    );
  }

  return (
    <div className="admin-theme bg-page text-fg-muted flex h-dvh flex-col overflow-hidden">
      <Header
        onOpenMobile={() => setMobileOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onToggleSidebar={toggleCollapsed}
        sidebarCollapsed={collapsed}
        maintenance={maintenance?.enabled}
        workspace={workspace}
      />
      <div className="relative flex min-h-0 flex-1">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          badges={{ enquiries: enquiryStats?.new, systemHealth: health?.errors }}
          workspace={workspace.current}
          shell={shell}
          resize={resize}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TabsBar
            shell={shell}
            workspace={currentWorkspace}
            homeHref={workspace.hrefFor(currentWorkspace)}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">{children}</main>
        </div>
      </div>

      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      <IdleWarning />
      <RecordHistoryDrawer />
    </div>
  );
}
