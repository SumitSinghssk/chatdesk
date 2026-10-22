"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MoreHorizontal, X, XCircle } from "lucide-react";

import { Dropdown } from "@/app/admin/_components/ui/index";
import { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { allowed, breadcrumbsFor, moduleByHref, moduleFor } from "../../_lib/nav";
import { useDashboard } from "../DashboardContext";
import type { ShellPrefsApi } from "./useShellPrefs";

// Mirrors app/admin/(panel)/_components/shell/TabsBar.tsx: open pages as draggable tabs + breadcrumbs.

export function TabsBar({ shell }: { shell: ShellPrefsApi }) {
  const router = useRouter();
  const pathname = usePathname();
  const active = moduleFor(pathname)?.href;
  const crumbs = breadcrumbsFor(pathname);
  const { me } = useDashboard();
  const tabs = shell.prefs.tabs;
  const homeHref = CUSTOMER_ROUTES.DASHBOARD();
  const stripRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const sort = useDragSort({ axis: "x", onMove: (from, to) => shell.reorderTabs(from, to) });

  useEffect(() => {
    stripRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  useEffect(() => {
    const strip = stripRef.current;
    const list = listRef.current;
    if (!strip || !list) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(strip);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  function measure() {
    const el = stripRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }

  const scrollBy = (direction: 1 | -1) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  const close = (path: string) => {
    if (path === active) {
      const index = tabs.findIndex((t) => t.path === path);
      const next = tabs[index + 1] ?? tabs[index - 1];
      router.push(next ? next.href : homeHref);
    }
    shell.closeTab(path);
  };

  return (
    <div className="border-line bg-surface flex h-10 shrink-0 items-stretch border-b">
      <div className="relative flex min-w-0 flex-1">
        <div
          ref={stripRef}
          onScroll={measure}
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
          }}
          className="no-scrollbar flex min-w-0 flex-1 touch-pan-x scroll-px-10 items-stretch overflow-x-auto overscroll-x-contain"
        >
          <div ref={listRef} role="tablist" aria-label="Open pages" className="flex shrink-0 items-stretch">
            {tabs.map((tab, index) => {
              const page = moduleByHref(tab.path);
              if (!page || !allowed(page, me.role)) return null;
              const isActive = tab.path === active;
              const drop = sort.indicator(index);
              return (
                <div
                  key={tab.path}
                  data-sort-item
                  {...sort.itemProps(index)}
                  {...sort.handleProps(index)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      close(tab.path);
                    }
                  }}
                  className={cn(
                    "group border-line relative flex max-w-52 shrink-0 items-center border-r text-[13px] transition-colors",
                    isActive ? "bg-page text-fg" : "text-fg-subtle hover:bg-hover hover:text-fg",
                    sort.isDragging(index) && "opacity-40"
                  )}
                >
                  {isActive && <span className="bg-primary absolute inset-x-0 top-0 h-0.5" aria-hidden />}
                  {drop && (
                    <span
                      aria-hidden
                      className={cn(
                        "bg-primary absolute inset-y-1 w-0.5",
                        drop === "before" ? "left-0" : "right-0"
                      )}
                    />
                  )}
                  <Link
                    href={tab.href}
                    role="tab"
                    aria-selected={isActive}
                    aria-current={isActive ? "page" : undefined}
                    draggable={false}
                    className={cn(
                      "flex min-w-0 items-center gap-2 py-2 pr-1 pl-3",
                      isActive && "font-semibold"
                    )}
                  >
                    <page.icon
                      className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-fg-faint")}
                    />
                    <span className="truncate">{page.label}</span>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Close ${page.label}`}
                    onClick={() => close(tab.path)}
                    className={cn(
                      "text-fg-faint hover:bg-line hover:text-fg mr-1.5 rounded p-0.5 transition",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <ScrollButton side="left" visible={edges.left} onClick={() => scrollBy(-1)} />
        <ScrollButton side="right" visible={edges.right} onClick={() => scrollBy(1)} />
      </div>

      <nav
        aria-label="Breadcrumb"
        className="text-fg-subtle hidden shrink-0 items-center gap-1 px-3 text-xs whitespace-nowrap xl:flex"
      >
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="text-line-strong h-3 w-3" />}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-fg">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-fg font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {tabs.length > 1 && (
        <div className="border-line flex shrink-0 items-center border-l px-1">
          <Dropdown
            width="w-44"
            trigger={() => (
              <button
                type="button"
                aria-label="Tab options"
                className="text-fg-faint hover:bg-hover hover:text-fg flex h-7 w-7 items-center justify-center rounded-md"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
            items={[
              {
                label: "Close other tabs",
                icon: XCircle,
                onClick: () => active && shell.closeOtherTabs(active),
                disabled: !active,
              },
              {
                label: "Close all tabs",
                icon: X,
                onClick: () => {
                  shell.closeAllTabs();
                  router.push(homeHref);
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function ScrollButton({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 flex items-center transition-opacity duration-200",
        side === "left"
          ? "from-surface via-surface/80 left-0 bg-linear-to-r to-transparent pr-6"
          : "from-surface via-surface/80 right-0 justify-end bg-linear-to-l to-transparent pl-6",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <button
        type="button"
        tabIndex={visible ? 0 : -1}
        onClick={onClick}
        aria-label={side === "left" ? "Scroll tabs left" : "Scroll tabs right"}
        className={cn(
          "border-line/70 bg-surface/60 text-fg-subtle hover:bg-surface/90 hover:text-fg mx-1 hidden h-7 w-7 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition md:flex",
          visible ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}
