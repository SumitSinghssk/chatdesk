"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  Code2,
  Compass,
  Home,
  Menu,
  Moon,
  Search,
  Sun,
  Webhook,
  X,
  type LucideIcon,
} from "lucide-react";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { API_GROUPS, href, pageBySlug, PAGES } from "../_content";
import type { DocPage, Section } from "../_content/types";
import { MethodBadge } from "./Endpoint";
import { SearchDialog } from "./Search";

const THEME_KEY = "sk_theme";
const OPEN_KEY = "cd_docs_open";

// The tabs under the logo, and the sidebar groups each one opens.
const TABS: { label: string; icon: LucideIcon; to: string; sections: Section[] }[] = [
  { label: "Home", icon: Home, to: "/docs", sections: [] },
  { label: "Getting Started", icon: BookOpen, to: "/docs/quickstart", sections: ["start"] },
  { label: "API Reference", icon: Code2, to: "/docs/api/send-message", sections: ["api"] },
  { label: "Webhooks", icon: Webhook, to: "/docs/webhooks", sections: ["webhooks"] },
  { label: "Guides", icon: Compass, to: "/docs/guides/zapier", sections: ["guides", "help"] },
];

interface Group {
  id: string;
  label: string;
  pages: DocPage[];
  /** API groups sit inside "API Reference" */
  nested?: boolean;
}

const SHORT: Record<string, string> = {
  "": "Introduction",
  quickstart: "Quickstart",
  "guides/zapier": "Zapier",
  "guides/make": "Make",
  "guides/google-sheets": "Google Sheets",
  "guides/website-orders": "Order updates from your website",
  "webhooks/events": "Event types",
  "webhooks/verify-signatures": "Verify signatures",
  "webhooks/retries": "Retries and delivery log",
  errors: "Errors and fixes",
  "api/me": "Check your API key",
  "api/send-message": "Send text",
  "api/send-template": "Send template",
  "api/send-media": "Send image or file",
  "api/get-message": "Get message status",
  "api/list-contacts": "List contacts",
  "api/upsert-contact": "Add or update contact",
  "api/get-contact": "Get contact",
  "api/update-contact": "Update contact",
  "api/delete-contact": "Delete contact",
  "api/list-conversations": "List conversations",
  "api/conversation-messages": "Chat messages",
  "api/list-templates": "List templates",
  "api/list-orders": "List orders",
  "api/get-order": "Get order",
};

function groups(): Group[] {
  const by = (s: Section) => PAGES.filter((p) => p.section === s);
  return [
    { id: "start", label: "Getting started", pages: by("start") },
    ...API_GROUPS.map((g) => ({
      id: `api-${g.label}`,
      label: g.label,
      pages: g.slugs.map((s) => pageBySlug(s)!),
      nested: true,
    })),
    { id: "webhooks", label: "Webhooks", pages: by("webhooks") },
    { id: "guides", label: "Guides", pages: by("guides") },
    { id: "help", label: "Help", pages: by("help") },
  ];
}
const GROUPS = groups();

function useDocsTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let mode: string | null = null;
    try {
      mode = localStorage.getItem(THEME_KEY);
    } catch {}
    const isDark = mode ? mode === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    setDark(isDark); // eslint-disable-line react-hooks/set-state-in-effect -- the saved theme is only known in the browser
    return () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    };
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
  };
  return { dark, toggle };
}

function currentSlug(pathname: string) {
  return pathname.replace(/^\/docs\/?/, "").replace(/\/$/, "");
}

/** Which groups are open: the one with the page you're on, plus any you opened (remembered). */
function useOpenGroups(slug: string) {
  const [manual, setManual] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setManual(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}")); // eslint-disable-line react-hooks/set-state-in-effect -- saved in the browser
    } catch {}
  }, []);
  const here = GROUPS.find((g) => g.pages.some((p) => p.slug === slug))?.id;
  const isOpen = (id: string) => manual[id] ?? (id === here || id === "start");
  const toggle = (id: string) => {
    const next = { ...manual, [id]: !isOpen(id) };
    setManual(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {}
  };
  return { isOpen, toggle };
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const slug = currentSlug(pathname);
  const { isOpen, toggle } = useOpenGroups(slug);
  const [filter, setFilter] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const q = filter.trim().toLowerCase();
  const shown = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        pages: q
          ? g.pages.filter((p) =>
              `${p.title} ${SHORT[p.slug] ?? ""} ${p.method ?? ""}`.toLowerCase().includes(q)
            )
          : g.pages,
      })).filter((g) => g.pages.length),
    [q]
  );

  return (
    <div className="pb-10">
      <div className="bg-surface sticky top-0 z-10 pt-4 pb-3">
        <label className="border-line focus-within:border-primary focus-within:ring-primary/15 flex h-9 items-center gap-2 rounded-lg border px-2.5 transition focus-within:ring-2">
          <Search className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />
          <input
            ref={input}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter pages"
            className="text-fg placeholder:text-fg-faint min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          {filter ? (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              className="text-fg-faint hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="border-line text-fg-subtle rounded border px-1 font-sans text-[9.5px]">
              CTRL-/
            </kbd>
          )}
        </label>
      </div>
      <nav aria-label="Docs" className="space-y-1">
        {shown.length === 0 && (
          <p className="text-fg-subtle px-2.5 py-4 text-[13px]">No pages match “{filter}”.</p>
        )}
        {shown.map((g, i) => {
          const open = q ? true : isOpen(g.id);
          const heading =
            g.nested && !shown[i - 1]?.nested ? (
              <p className="text-fg-subtle mt-4 mb-1 px-2.5 text-[11px] font-semibold tracking-[0.06em] uppercase">
                API Reference
              </p>
            ) : null;
          return (
            <div key={g.id}>
              {heading}
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-expanded={open}
                className={cn(
                  "hover:bg-hover flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition",
                  g.nested
                    ? "text-fg text-[13.5px] font-medium"
                    : "text-fg-subtle mt-3 text-[11px] font-semibold tracking-[0.06em] uppercase"
                )}
              >
                {g.label}
                <ChevronRight
                  className={cn("text-fg-faint h-3.5 w-3.5 transition-transform", open && "rotate-90")}
                />
              </button>
              {open && (
                <ul className={cn("mt-0.5 space-y-px", g.nested && "border-line ml-3 border-l pl-1.5")}>
                  {g.pages.map((p) => {
                    const active = p.slug === slug;
                    return (
                      <li key={p.slug}>
                        <Link
                          href={href(p.slug)}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-start justify-between gap-2 rounded-md px-2.5 py-[6px] text-[13.5px] leading-5 transition",
                            active
                              ? "bg-hover text-fg font-medium"
                              : "text-fg-muted hover:bg-hover/70 hover:text-fg"
                          )}
                        >
                          <span className="min-w-0 break-words">{SHORT[p.slug] ?? p.title}</span>
                          {p.method && <MethodBadge method={p.method} className="mt-px text-[9px]" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const slug = currentSlug(pathname);
  const page = pageBySlug(slug);
  const { dark, toggle } = useDocsTheme();
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menu = menuAt === pathname;
  const [searching, setSearching] = useState(false);
  const activeTab = slug === "" ? TABS[0] : TABS.find((t) => page && t.sections.includes(page.section));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((v) => !v);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearching(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bg-surface text-fg-muted min-h-dvh">
      <a
        href="#docs-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[300] focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="bg-surface border-line sticky top-0 z-50 border-b">
        {/* logo, search, account */}
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuAt(menu ? null : pathname)}
            className="text-fg-subtle hover:bg-hover hover:text-fg -ml-1.5 rounded-lg p-1.5 lg:hidden"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
          >
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/docs" className="flex shrink-0 items-center gap-2">
            <span className="bg-primary flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold text-white shadow-sm">
              {siteConfig.name.charAt(0)}
            </span>
            <span className="text-fg text-[15px] font-semibold tracking-tight">{siteConfig.name}</span>
            <span className="text-fg-faint text-[15px] font-light">/</span>
            <span className="text-fg-muted text-[15px] font-medium">Docs</span>
          </Link>

          <button
            type="button"
            onClick={() => setSearching(true)}
            className="border-line bg-page/60 text-fg-subtle hover:border-line-strong hover:bg-page mx-auto hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border px-3 text-left text-[13px] transition md:flex"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Search docs</span>
            <kbd className="border-line bg-surface text-fg-subtle rounded border px-1.5 py-px font-sans text-[10px] font-medium">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="text-fg-subtle hover:bg-hover hover:text-fg rounded-lg p-2 md:hidden"
              aria-label="Search the docs"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="text-fg-subtle hover:bg-hover hover:text-fg rounded-lg p-2"
              aria-label={dark ? "Light theme" : "Dark theme"}
            >
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <Link
              href="/dashboard/integrations"
              className="bg-primary hover:bg-primary-hover ml-1 hidden h-8 items-center rounded-lg px-3 text-[13px] font-semibold text-white shadow-sm transition sm:inline-flex"
            >
              Dashboard
            </Link>
          </div>
        </div>
        {/* section tabs */}
        <nav
          aria-label="Sections"
          className="no-scrollbar mx-auto flex h-11 max-w-[1400px] items-stretch gap-5 overflow-x-auto px-4 sm:px-6"
        >
          {TABS.map((t) => {
            const active = t === activeTab;
            return (
              <Link
                key={t.label}
                href={t.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 text-[13.5px] font-medium whitespace-nowrap transition",
                  active ? "border-primary text-fg" : "text-fg-subtle hover:text-fg border-transparent"
                )}
              >
                <t.icon className={cn("h-4 w-4", active ? "text-primary" : "text-fg-faint")} aria-hidden />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <aside className="border-line sticky top-[6.25rem] hidden h-[calc(100dvh-6.25rem)] w-[272px] shrink-0 overflow-y-auto border-r px-4 lg:block">
          <Sidebar onNavigate={() => {}} />
        </aside>
        {menu && (
          <div className="fixed inset-0 top-[6.25rem] z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/40" onClick={() => setMenuAt(null)} />
            <aside className="bg-surface border-line absolute inset-y-0 left-0 w-[min(18rem,85vw)] overflow-y-auto border-r px-4 shadow-xl">
              <Sidebar onNavigate={() => setMenuAt(null)} />
            </aside>
          </div>
        )}
        <div id="docs-content" className="min-w-0 flex-1">
          {children}
        </div>
      </div>
      <SearchDialog open={searching} onClose={() => setSearching(false)} />
    </div>
  );
}
