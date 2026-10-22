"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { adminPortalTarget } from "@/app/admin/_components/ui/portal";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, Search } from "lucide-react";

import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import api from "@/app/admin/_lib/api/client";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { cn } from "@/lib/utils";

import { navSections, quickCreate } from "@/config/navigation";

import { ADMIN_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
const SETTINGS_SHORTCUTS: { label: string; tab: string; permission?: string }[] = [
  { label: "Business profile", tab: "general" },
  { label: "Date & time", tab: "date-time" },
  { label: "Security & firewall", tab: "security" },
  { label: "Email (SMTP)", tab: "email" },
  { label: "Email templates", tab: "email-templates" },
  { label: "SMS gateways", tab: "sms" },
  { label: "Payment gateways", tab: "payments" },
  { label: "Customer login", tab: "customer-login" },
  { label: "Scripts & CSS", tab: "scripts" },
  { label: "Sitemap", tab: "sitemap" },
  { label: "Application logs", tab: "logs", permission: PERM.LOGS_VIEW },
  { label: "Robots.txt", tab: "robots" },
  { label: "Maintenance mode", tab: "maintenance" },
];

const ACCOUNT_LINKS = [
  { label: "My profile", url: ADMIN_ROUTES.PROFILE() },
  { label: "Two-factor sign-in", url: ADMIN_ROUTES.PROFILE({ tab: "security" }) },
  { label: "Active sessions", url: ADMIN_ROUTES.PROFILE({ tab: "sessions" }) },
  { label: "Notifications", url: ADMIN_ROUTES.NOTIFICATIONS() },
];

interface SearchGroup {
  type: string;
  label: string;
  items: { id: number; title: string; subtitle?: string | null; url: string }[];
}

interface Entry {
  key: string;
  group: string;
  title: string;
  subtitle?: string | null;
  url: string;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const can = usePermissions();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const debounced = useDebouncedValue(query.trim(), 250);

  const { data: results, isFetching } = useQuery({
    queryKey: [QK.SEARCH, debounced],
    queryFn: async () =>
      (await api.get<{ data: SearchGroup[] }>(ADMIN_ENDPOINTS.SEARCH, { params: { q: debounced } })).data
        .data,
    enabled: debounced.length >= 2,
  });

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const pages: Entry[] = navSections
      .flatMap((s) => s.items)
      .filter((i) => can(i.permission) && (!q || i.label.toLowerCase().includes(q)))
      .map((i) => ({ key: `nav-${i.href}`, group: "Pages", title: i.label, url: i.href }));
    const creates: Entry[] = quickCreate
      .filter((c) => can(c.permission) && (!q || `create ${c.label}`.toLowerCase().includes(q)))
      .map((c) => ({
        key: `new-${c.href}`,
        group: "Create",
        title: `New ${c.label.toLowerCase()}`,
        url: c.href,
      }));
    const records: Entry[] = (debounced.length >= 2 ? (results ?? []) : []).flatMap((g) =>
      g.items.map((i) => ({
        key: `${g.type}-${i.id}`,
        group: g.label,
        title: i.title,
        subtitle: i.subtitle,
        url: i.url,
      }))
    );
    const match = (label: string) => !q || label.toLowerCase().includes(q);
    const settings: Entry[] = can(PERM.SETTINGS_VIEW)
      ? SETTINGS_SHORTCUTS.filter(
          (s) => can(s.permission) && (match(s.label) || (!!q && "settings".includes(q)))
        ).map((s) => ({
          key: `settings-${s.tab}`,
          group: "Settings",
          title: s.label,
          url: ADMIN_ROUTES.SETTINGS({ tab: s.tab }),
        }))
      : [];
    const account: Entry[] = ACCOUNT_LINKS.filter((a) => match(a.label)).map((a) => ({
      key: `account-${a.url}`,
      group: "Account",
      title: a.label,
      url: a.url,
    }));
    return q
      ? [...records, ...pages.slice(0, 8), ...settings.slice(0, 6), ...creates.slice(0, 5), ...account]
      : [...pages.slice(0, 6), ...creates.slice(0, 3), ...account.slice(0, 2)];
  }, [query, debounced, results, can]);

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
      <div className="modal-panel border-line bg-surface w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl">
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
            placeholder="Search pages, posts, users, enquiries…"
            className="text-fg placeholder:text-fg-faint flex-1 bg-transparent py-4 text-base focus:outline-none"
          />
          {isFetching && <Loader2 className="text-fg-faint h-4 w-4 animate-spin" />}
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
