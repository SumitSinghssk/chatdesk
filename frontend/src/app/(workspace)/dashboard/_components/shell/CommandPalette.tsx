"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";

import { adminPortalTarget } from "@/app/admin/_components/ui/portal";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { NAV_SECTIONS, modulesFor } from "../../_lib/nav";
import { useDashboard } from "../DashboardContext";

// Mirrors the admin CommandPalette (Ctrl K). Searches workspace pages and account shortcuts;
// records (contacts, chats, campaigns) join here as those modules are built.

const SHORTCUTS = [
  { label: "Connect WhatsApp number", url: CUSTOMER_ROUTES.WHATSAPP() },
  { label: "Webhook URL & verify token", url: CUSTOMER_ROUTES.WHATSAPP() },
  { label: "Change password", url: CUSTOMER_ROUTES.ACCOUNT() },
  { label: "Signed-in devices", url: CUSTOMER_ROUTES.ACCOUNT() },
];

interface Entry {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  url: string;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const { me } = useDashboard();

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (label: string) => !q || label.toLowerCase().includes(q);
    const pages: Entry[] = modulesFor(me.role)
      .filter((m) => match(`${m.label} ${m.description}`))
      .map((m) => ({
        key: `page-${m.key}`,
        group: "Pages",
        title: m.label,
        subtitle:
          m.status === "planned"
            ? `Coming in ${m.phase}`
            : NAV_SECTIONS.find((s) => s.key === m.section)?.label,
        url: m.href,
      }));
    const shortcuts: Entry[] = SHORTCUTS.filter((s) => match(s.label)).map((s) => ({
      key: `shortcut-${s.label}`,
      group: "Shortcuts",
      title: s.label,
      url: s.url,
    }));
    return [...pages, ...shortcuts];
  }, [query, me.role]);

  if (typeof document === "undefined") return null;

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    router.push(entry.url);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(entries.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(entries[cursor]);
    } else if (e.key === "Escape") onClose();
  };

  let lastGroup = "";
  return createPortal(
    <div
      className="drawer-scrim admin-theme fixed inset-0 z-60 flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="modal-panel border-line bg-surface w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl"
      >
        <div className="border-line flex items-center gap-2.5 border-b px-4">
          <Search className="text-fg-faint h-4.5 w-4.5" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages and settings…"
            className="text-fg placeholder:text-fg-faint flex-1 bg-transparent py-4 text-base focus:outline-none"
          />
          <kbd className="border-line text-fg-faint rounded border px-1.5 py-0.5 font-sans text-[10px] font-semibold">
            ESC
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {entries.length === 0 && (
            <p className="text-fg-subtle px-4 py-8 text-center text-sm">No results for “{query}”.</p>
          )}
          {entries.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <div key={entry.key}>
                {header && <p className="text-fg-faint px-2 pt-2 pb-1 text-[11px] font-medium">{header}</p>}
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                    i === cursor && "bg-primary-soft"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-medium",
                        i === cursor ? "text-primary" : "text-fg"
                      )}
                    >
                      {entry.title}
                    </span>
                    {entry.subtitle && (
                      <span className="text-fg-subtle block truncate text-xs">{entry.subtitle}</span>
                    )}
                  </span>
                  {i === cursor && <CornerDownLeft className="text-primary h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    adminPortalTarget()
  );
}
