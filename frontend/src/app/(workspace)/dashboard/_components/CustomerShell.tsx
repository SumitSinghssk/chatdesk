"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { notifyMemberChange } from "@/app/(customer)/_components/AccountLink";
import {
  CustomerApiError,
  customerApi,
  errorMessage,
  type CustomerProfile,
} from "@/app/(customer)/_lib/customerApi";
import { useSidebarResize } from "@/app/admin/(panel)/_components/shell/useSidebarResize";
import { Button, Card, EmptyState, ErrorBanner, Spinner } from "@/app/admin/_components/ui/index";
import { useThemeStore } from "@/app/admin/_store/themeStore";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { playChime } from "@/lib/alerts";
import { setDateOrder, setDisplayTimeZone } from "@/lib/utils";

import { allowed, moduleFor } from "../_lib/nav";
import { INBOX_QK, inboxApi } from "../_lib/inboxApi";
import { NUMBERS_QK, announceNumber, numbersApi, onNumberChange } from "../_lib/numbersApi";
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
const NUMBER_COOKIE = "cd_number";

function cookieNumber(): number | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${NUMBER_COOKIE}=`));
  return hit ? Number(hit.split("=")[1]) || null : null;
}

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

  const numbers = useQuery({
    queryKey: NUMBERS_QK.LIST,
    queryFn: async () => (await numbersApi.list()).data,
    enabled: !!me.data,
    refetchInterval: 30_000,
  });
  const number = numbers.data?.find((n) => n.current) ?? numbers.data?.[0];
  const numberId = number?.id;

  const inbox = useQuery({
    queryKey: INBOX_QK.SUMMARY,
    queryFn: async () => (await inboxApi.summary()).data,
    enabled: !!me.data,
    refetchInterval: 15_000,
  });

  // Switching number: everything on screen belonged to the old one, so the page starts over
  // (detail pages go back to their list) and every other tab follows.
  const applyNumber = useCallback(
    (to?: string) => {
      void queryClient.resetQueries({
        predicate: (q) => q.queryKey[0] !== "workspace" || q.queryKey[1] === "whatsapp",
      });
      const here = `${window.location.pathname}${window.location.search}`;
      const dest = to ?? moduleFor(window.location.pathname)?.href ?? CUSTOMER_ROUTES.DASHBOARD();
      if (dest !== here) router.replace(dest);
    },
    [queryClient, router]
  );
  const switchNumber = useCallback(
    async (id: number, opts?: { to?: string }) => {
      const res = await numbersApi.switchTo(id);
      applyNumber(opts?.to);
      announceNumber(id);
      toast.success(res.message ?? "Switched");
    },
    [applyNumber]
  );
  useEffect(() => {
    if (numberId === undefined) return;
    const follow = (id: number | null) => {
      if (id && id !== numberId) applyNumber();
    };
    const stop = onNumberChange(follow);
    const onFocus = () => follow(cookieNumber());
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
    };
  }, [numberId, applyNumber]);

  // a link to a chat or an order on another number (e.g. from a notification) switches to it first
  const linkedNumber = searchParams.get("number");
  useEffect(() => {
    if (!linkedNumber || !numbers.data) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("number");
    const rest = params.toString() ? `${pathname}?${params}` : pathname;
    const target = numbers.data.find((n) => String(n.id) === linkedNumber);
    if (target && !target.current) {
      void switchNumber(target.id, { to: rest }).catch(() => router.replace(rest));
    } else {
      if (!target) toast.error("You don't have access to that number");
      router.replace(rest);
    }
  }, [linkedNumber, numbers.data, searchParams, pathname, switchNumber, router]);

  // the person's preferences: time zone and date order for every date shown, the theme they chose
  const prefs = me.data?.preferences;
  useEffect(() => {
    if (!prefs) return;
    setDisplayTimeZone(prefs.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
    setDateOrder(prefs.date_format);
    if (prefs.theme === "system") {
      useThemeStore
        .getState()
        .setMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      useThemeStore.getState().setMode(prefs.theme);
    }
  }, [prefs]);

  // a soft sound when a new customer message comes in (if they want it)
  const lastUnread = useRef<number | null>(null);
  const unread = inbox.data?.unread;
  useEffect(() => {
    lastUnread.current = null; // another number's count isn't news
  }, [numberId]);
  useEffect(() => {
    if (unread === undefined) return;
    if (lastUnread.current !== null && unread > lastUnread.current && prefs?.sound) playChime();
    lastUnread.current = unread;
  }, [unread, prefs?.sound]);

  const shell = useShellPrefs(me.data?.id ?? "guest");
  const opened = moduleFor(pathname);
  // pages this person's role can't open don't become tabs
  const pagePath = opened && me.data && allowed(opened, me.data.role) ? opened.href : undefined;
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
  const current = moduleFor(pathname);
  const blocked = current && me.data && !allowed(current, me.data.role) ? current : null;

  const failed = (me.error && !signedOut) || numbers.error;
  if (failed) {
    return (
      <div className="bg-canvas flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3">
          <ErrorBanner message={errorMessage(failed)} />
          {!me.error && (
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!me.data || !options.data || !numbers.data || !number) {
    return (
      <div className="bg-canvas min-h-screen">
        <Spinner className="min-h-screen" />
      </div>
    );
  }

  return (
    <DashboardContext.Provider
      value={{ me: me.data, options: options.data, setMe, numbers: numbers.data, number, switchNumber }}
    >
      <div className="bg-page text-fg-muted flex h-dvh flex-col overflow-hidden">
        <Header
          numbers={numbers.data}
          number={number}
          onSwitchNumber={switchNumber}
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
            {/* keyed by number: a page never keeps the previous number's state */}
            <main
              key={number.id}
              id="content"
              className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4"
            >
              {blocked ? (
                <Card>
                  <EmptyState
                    icon={Lock}
                    title={`${blocked.label} is for owners and admins`}
                    description="Your role in this workspace doesn't include this page. Ask an admin of your team if you need it."
                    action={
                      <Button onClick={() => router.push(CUSTOMER_ROUTES.INBOX())}>Go to the inbox</Button>
                    }
                  />
                </Card>
              ) : (
                children
              )}
            </main>
          </div>
        </div>
        {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      </div>
    </DashboardContext.Provider>
  );
}
