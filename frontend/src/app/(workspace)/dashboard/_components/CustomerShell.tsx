"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { notifyMemberChange } from "@/app/(customer)/_components/AccountLink";
import {
  CustomerApiError,
  customerApi,
  errorMessage,
  type CustomerProfile,
} from "@/app/(customer)/_lib/customerApi";
import { useSidebarResize } from "@/app/admin/(panel)/_components/shell/useSidebarResize";
import { ErrorBanner, Spinner } from "@/app/admin/_components/ui/index";
import { useThemeStore } from "@/app/admin/_store/themeStore";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { moduleFor } from "../_lib/nav";
import { INBOX_QK, inboxApi } from "../_lib/inboxApi";
import { WORKSPACE_QK } from "../_lib/whatsappApi";
import { DashboardContext } from "./DashboardContext";
import { CommandPalette } from "./shell/CommandPalette";
import { Header } from "./shell/Header";
import { Sidebar } from "./shell/Sidebar";
import { TabsBar } from "./shell/TabsBar";
import { useShellPrefs } from "./shell/useShellPrefs";

// The customer workspace shell. Same layout and behaviour as AdminShell (header, resizable and
// collapsible sidebar, open-page tabs, Ctrl K search, dark mode), signed in with the customer session.

const COLLAPSE_KEY = "ck_sidebar_collapsed";

/** Dark mode follows the admin setting while inside the workspace and is removed on the way out. */
function useWorkspaceTheme() {
  useEffect(() => {
    let mode: string | null = null;
    try {
      mode = localStorage.getItem("sk_theme");
    } catch {}
    const dark = mode ? mode === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    useThemeStore.setState({ mode: dark ? "dark" : "light" });
    return () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    };
  }, []);
}

export function CustomerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  useWorkspaceTheme();

  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1"
  );
  const [mobileOpenAt, setMobileOpenAt] = useState<string | null>(null);
  const mobileOpen = mobileOpenAt === pathname;
  const setMobileOpen = (open: boolean) => setMobileOpenAt(open ? pathname : null);
  const [searchOpen, setSearchOpen] = useState(false);

  const me = useQuery({
    queryKey: WORKSPACE_QK.ME,
    queryFn: async () => (await customerApi.me()).data,
    retry: (count, err) => !(err instanceof CustomerApiError && err.status === 401) && count < 2,
  });
  const options = useQuery({
    queryKey: WORKSPACE_QK.OPTIONS,
    queryFn: async () => (await customerApi.options()).data,
    staleTime: 300_000,
  });

  const inbox = useQuery({
    queryKey: INBOX_QK.SUMMARY,
    queryFn: async () => (await inboxApi.summary()).data,
    enabled: !!me.data,
    refetchInterval: 15_000,
  });

  const shell = useShellPrefs(me.data?.id ?? "guest");
  const pagePath = moduleFor(pathname)?.href;
  const search = searchParams.toString();
  const { visit } = shell;
  useEffect(() => {
    if (pagePath && me.data) visit(pagePath, search ? `${pathname}?${search}` : pathname);
  }, [pagePath, pathname, search, me.data, visit]);

  const setCollapsedPersist = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {}
  };
  const resize = useSidebarResize({ collapsed, setCollapsed: setCollapsedPersist });

  const toLogin = () => {
    queryClient.clear();
    notifyMemberChange();
    router.replace(CUSTOMER_ROUTES.LOGIN({ next: pathname }));
    router.refresh();
  };

  const signedOut = me.error instanceof CustomerApiError && me.error.status === 401;
  useEffect(() => {
    if (!signedOut) return;
    void customerApi
      .logout()
      .catch(() => null)
      .finally(() => {
        queryClient.clear();
        notifyMemberChange();
        router.replace(CUSTOMER_ROUTES.LOGIN({ next: pathname }));
      });
  }, [signedOut, queryClient, router, pathname]);

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

  const signOut = async () => {
    await customerApi.logout().catch(() => null);
    toLogin();
  };

  const setMe = (next: CustomerProfile) => queryClient.setQueryData(WORKSPACE_QK.ME, next);

  if (me.error && !signedOut) {
    return (
      <div className="bg-canvas flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <ErrorBanner message={errorMessage(me.error)} />
        </div>
      </div>
    );
  }

  if (!me.data || !options.data) {
    return (
      <div className="bg-canvas min-h-screen">
        <Spinner className="min-h-screen" />
      </div>
    );
  }

  return (
    <DashboardContext.Provider value={{ me: me.data, options: options.data, setMe }}>
      <div className="bg-page text-fg-muted flex h-dvh flex-col overflow-hidden">
        <Header
          onOpenMobile={() => setMobileOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleSidebar={() => setCollapsedPersist(!collapsed)}
          sidebarCollapsed={collapsed}
          onSignOut={signOut}
        />
        <div className="relative flex min-h-0 flex-1">
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <Sidebar
            badges={{ inbox: inbox.data?.unread }}
            collapsed={collapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            shell={shell}
            resize={resize}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <TabsBar shell={shell} />
            <main id="content" className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
              {children}
            </main>
          </div>
        </div>
        {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      </div>
    </DashboardContext.Provider>
  );
}
