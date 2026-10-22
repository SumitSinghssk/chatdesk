"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronRight, Globe, Search, Star, X, type LucideIcon } from "lucide-react";

import { CUSTOMER_ROUTES } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { NAV_SECTIONS, modulesFor, moduleFor, type WorkspaceModule } from "../../_lib/nav";
import { useDashboard } from "../DashboardContext";
import type { ShellPrefsApi } from "./useShellPrefs";

// Mirrors app/admin/(panel)/_components/shell/Sidebar.tsx, driven by the workspace module list.

const CLOSED_KEY = "ck_nav_closed";

export type SidebarBadges = Partial<Record<NonNullable<WorkspaceModule["badge"]>, number>>;

interface SidebarProps {
  badges: SidebarBadges;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  shell: ShellPrefsApi;
  resize: {
    resizing: boolean;
    startResize: (e: React.PointerEvent) => void;
    nudge: (delta: number, el: HTMLElement | null) => void;
    reset: () => void;
  };
}

export function Sidebar({ badges, collapsed, mobileOpen, onCloseMobile, shell, resize }: SidebarProps) {
  const asideRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const active = moduleFor(pathname)?.href;
  const { me } = useDashboard();
  const modules = modulesFor(me.role);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const toggleGroup = (key: string) =>
    setClosed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: modules.filter((m) => m.section === s.key),
  })).filter((s) => s.items.length > 0);
  const favorites = shell.prefs.favorites
    .map((path) => modules.find((item) => item.href === path))
    .filter((i): i is WorkspaceModule => !!i);
  const q = query.trim().toLowerCase();
  const sectionLabel = (m: WorkspaceModule) => NAV_SECTIONS.find((s) => s.key === m.section)?.label ?? "";
  const matches = q ? modules.filter((i) => `${i.label} ${sectionLabel(i)}`.toLowerCase().includes(q)) : [];

  const itemProps = { active, badges, collapsed, onNavigate: onCloseMobile, shell };

  return (
    <aside
      ref={asideRef}
      className={cn(
        "border-line bg-surface fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r shadow-xl transition-[transform,width] duration-200 ease-out",
        "lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 lg:shadow-none",
        collapsed ? "lg:w-14" : "lg:w-(--sidebar-w,--spacing(60))",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        resize.resizing && "transition-none!"
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize · double-click to reset"
        tabIndex={0}
        onPointerDown={resize.startResize}
        onDoubleClick={resize.reset}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            resize.nudge(e.key === "ArrowRight" ? 16 : -16, asideRef.current);
          }
        }}
        className="group/resize absolute inset-y-0 -right-1.5 z-10 hidden w-3 cursor-col-resize touch-none focus-visible:outline-none lg:block"
      >
        <span
          className={cn(
            "bg-line-strong group-focus-visible/resize:bg-primary absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full opacity-0 transition-opacity group-hover/resize:opacity-100",
            resize.resizing && "bg-primary! opacity-100!"
          )}
        />
      </div>

      <div className="border-line flex h-12 shrink-0 items-center gap-2 border-b px-3 lg:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-linear-to-br from-indigo-500 to-indigo-700 text-xs font-bold text-white">
          {siteConfig.name.charAt(0)}
        </span>
        <span className="text-fg flex-1 truncate text-sm font-semibold">{siteConfig.name}</span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="text-fg-faint hover:bg-hover flex h-8 w-8 items-center justify-center rounded-md"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {collapsed ? (
        <nav className="hidden flex-1 flex-col items-center gap-1 py-2 lg:flex" aria-label="Main menu">
          {favorites.length > 0 && (
            <RailGroup icon={Star} label="Favorites" items={favorites} {...itemProps} />
          )}
          {sections.map((s) => (
            <RailGroup key={s.key} icon={s.icon} label={s.label} items={s.items} {...itemProps} />
          ))}
        </nav>
      ) : null}

      <nav
        aria-label="Main menu"
        className={cn("flex-1 space-y-3 overflow-y-auto px-2 py-2", collapsed && "lg:hidden")}
      >
        <label className="border-line bg-page focus-within:border-primary flex h-8 items-center gap-2 rounded-md border px-2">
          <Search className="text-fg-faint h-3.5 w-3.5 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Find a page…"
            aria-label="Find a page"
            className="text-fg placeholder:text-fg-faint w-full bg-transparent text-[13px] outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQuery("")}
              className="text-fg-faint hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        {q ? (
          <Group label={`Results (${matches.length})`}>
            {matches.length ? (
              matches.map((item) => (
                <NavLink key={item.href} item={item} hint={sectionLabel(item)} {...itemProps} />
              ))
            ) : (
              <p className="text-fg-faint px-2 py-1.5 text-xs">No pages match.</p>
            )}
          </Group>
        ) : (
          <>
            {favorites.length > 0 && (
              <Group label="Favorites" icon={Star}>
                {favorites.map((item) => (
                  <NavLink key={item.href} item={item} {...itemProps} />
                ))}
              </Group>
            )}
            {sections.map((s) => (
              <Group
                key={s.key}
                label={s.label}
                collapsible
                open={!closed.includes(s.key)}
                onToggle={() => toggleGroup(s.key)}
                count={s.items.length}
              >
                {s.items.map((item) => (
                  <NavLink key={item.href} item={item} {...itemProps} />
                ))}
              </Group>
            ))}
          </>
        )}
      </nav>

      <div className={cn("border-line shrink-0 border-t p-2", collapsed && "lg:flex lg:justify-center")}>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title="View website"
          className={cn(
            "group text-fg-muted hover:bg-hover hover:text-fg flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
            collapsed && "lg:w-9 lg:justify-center lg:px-0"
          )}
        >
          <Globe className="text-fg-faint group-hover:text-fg-muted h-4 w-4 shrink-0" />
          <span className={cn("flex-1", collapsed && "lg:hidden")}>View website</span>
          <ArrowUpRight className={cn("text-fg-faint h-3.5 w-3.5", collapsed && "lg:hidden")} />
        </a>
      </div>
    </aside>
  );
}

function Group({
  label,
  icon: Icon,
  children,
  collapsible,
  open = true,
  onToggle,
  count,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  count?: number;
}) {
  const heading = (
    <>
      {Icon && <Icon className="h-3 w-3" />}
      <span className="flex-1 text-left">{label}</span>
      {collapsible && !open && count !== undefined && (
        <span className="tabular bg-line/70 text-fg-subtle rounded px-1 text-[10px] leading-4 font-semibold">
          {count}
        </span>
      )}
      {collapsible && <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />}
    </>
  );
  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-fg-faint hover:text-fg-muted flex h-6 w-full items-center gap-1.5 px-2 text-[10.5px] font-semibold tracking-wide uppercase"
        >
          {heading}
        </button>
      ) : (
        <p className="text-fg-faint flex h-6 items-center gap-1.5 px-2 text-[10.5px] font-semibold tracking-wide uppercase">
          {heading}
        </p>
      )}
      {open && <div className="space-y-px">{children}</div>}
    </div>
  );
}

interface ItemProps {
  active?: string;
  badges: SidebarBadges;
  collapsed: boolean;
  onNavigate: () => void;
  shell: ShellPrefsApi;
}

function SoonPill() {
  return (
    <span className="bg-line/70 text-fg-subtle rounded px-1 text-[10px] leading-4 font-semibold group-hover/item:hidden">
      Soon
    </span>
  );
}

function NavLink({
  item,
  hint,
  active,
  badges,
  onNavigate,
  shell,
}: ItemProps & { item: WorkspaceModule; hint?: string }) {
  const isActive = item.href === active;
  const badge = item.badge ? badges[item.badge] : undefined;
  const favorite = shell.prefs.favorites.includes(item.href);
  return (
    <div className="group/item relative">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md pr-7 pl-2 text-[13px] transition-colors",
          isActive
            ? "bg-primary-soft text-primary font-semibold"
            : "text-fg-muted hover:bg-hover hover:text-fg font-medium"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-fg-faint")} />
        <span className="min-w-0 flex-1 truncate">
          {item.label}
          {hint && <span className="text-fg-faint ml-1.5 text-[11px] font-normal">{hint}</span>}
        </span>
        {item.status === "planned" && <SoonPill />}
        {!!badge && (
          <span className="tabular bg-primary rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white group-hover/item:hidden">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={() => shell.toggleFavorite(item.href)}
        aria-label={favorite ? `Remove ${item.label} from favorites` : `Add ${item.label} to favorites`}
        aria-pressed={favorite}
        className={cn(
          "absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition",
          favorite
            ? "text-amber-500"
            : "text-fg-faint opacity-0 group-hover/item:opacity-100 hover:text-amber-500 focus-visible:opacity-100"
        )}
      >
        <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
      </button>
    </div>
  );
}

function RailGroup({
  icon: Icon,
  label,
  items,
  active,
  badges,
}: ItemProps & { icon: LucideIcon; label: string; items: WorkspaceModule[] }) {
  const isActive = items.some((i) => i.href === active);
  const count = items.reduce((n, i) => n + (i.badge ? (badges[i.badge] ?? 0) : 0), 0);
  return (
    <div className="group/rail relative">
      <Link
        href={items[0]?.href ?? CUSTOMER_ROUTES.DASHBOARD()}
        aria-label={label}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-md transition",
          isActive ? "bg-primary-soft text-primary" : "text-fg-faint hover:bg-hover hover:text-fg"
        )}
      >
        <Icon className="h-4.5 w-4.5" />
        {count > 0 && (
          <span className="bg-primary absolute top-1 right-1 h-1.5 w-1.5 rounded-full" aria-hidden />
        )}
      </Link>
      <div className="invisible absolute top-0 left-full z-50 pl-2 opacity-0 transition group-focus-within/rail:visible group-focus-within/rail:opacity-100 group-hover/rail:visible group-hover/rail:opacity-100">
        <div className="border-line bg-surface w-52 rounded-lg border p-1 shadow-xl">
          <p className="text-fg-faint px-2 py-1 text-[10.5px] font-semibold tracking-wide uppercase">
            {label}
          </p>
          {items.map((item) => {
            const current = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px]",
                  current
                    ? "bg-primary-soft text-primary font-semibold"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.status === "planned" && (
                  <span className="text-fg-faint text-[10px] font-semibold">Soon</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
