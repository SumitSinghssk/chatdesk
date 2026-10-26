"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock3,
  IndianRupee,
  Megaphone,
  ShoppingBag,
  Settings,
  Sparkles,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { playChime, showDesktop } from "@/lib/alerts";
import { cn, timeAgo } from "@/lib/utils";

import { ACCOUNT_QK, accountApi, type NotificationItem, type NotifyEvent } from "../../_lib/accountApi";
import { useDashboard } from "../DashboardContext";

const ICONS: Record<NotifyEvent, { icon: LucideIcon; className: string }> = {
  chat_assigned: { icon: UserRoundCheck, className: "bg-primary-soft text-primary" },
  customer_waiting: { icon: Clock3, className: "bg-warning-soft text-warning" },
  ai_handover: { icon: Sparkles, className: "bg-purple-soft text-purple" },
  campaign_finished: { icon: Megaphone, className: "bg-info-soft text-info" },
  whatsapp_problem: { icon: AlertTriangle, className: "bg-danger-soft text-danger" },
  new_order: { icon: ShoppingBag, className: "bg-success-soft text-success" },
  payment_received: { icon: IndianRupee, className: "bg-success-soft text-success" },
};

export function NotificationBell({ className }: { className?: string }) {
  const { me } = useDashboard();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const newest = useRef<number | null>(null);
  const feed = useQuery({
    queryKey: ACCOUNT_QK.FEED,
    queryFn: () => accountApi.notifications().then((r) => r.data),
    refetchInterval: 20_000,
  });
  const items = feed.data?.items ?? [];
  const unread = feed.data?.unread ?? 0;

  // new ones since the last look: a desktop pop-up (if they chose it) and a sound
  useEffect(() => {
    if (!feed.data) return;
    const top = feed.data.items[0]?.id ?? 0;
    if (newest.current !== null && top > newest.current) {
      const fresh = feed.data.items.filter((n) => n.id > newest.current! && !n.read);
      for (const n of fresh.slice(0, 3)) {
        if (n.browser) showDesktop(n.title, n.body, n.url, `chatdesk-${n.id}`);
        if (!document.hidden) toast(n.title, { description: n.body ?? undefined });
      }
      if (fresh.length && me.preferences.sound) playChime();
    }
    newest.current = top;
  }, [feed.data, me.preferences.sound]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const read = async (body: { ids?: number[]; all?: boolean }) => {
    await accountApi.markRead(body).catch(() => null);
    void qc.invalidateQueries({ queryKey: ACCOUNT_QK.FEED });
  };
  const openItem = (n: NotificationItem) => {
    setOpen(false);
    if (!n.read) void read({ ids: [n.id] });
    if (n.url) router.push(n.url);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("relative", className)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="bg-danger absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="border-line bg-surface fixed inset-x-2 top-14 z-50 overflow-hidden rounded-xl border shadow-xl sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-96"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-fg text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => read({ all: true })}
                  className="text-primary hover:bg-hover inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
                </button>
              )}
              <button
                type="button"
                aria-label="Notification settings"
                title="Notification settings"
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard/account?section=notifications");
                }}
                className="text-fg-subtle hover:bg-hover rounded-md p-1.5"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Bell className="text-fg-faint h-8 w-8" aria-hidden />
              <p className="text-fg text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-fg-subtle text-xs">
                Chats assigned to you, customers waiting and other alerts show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-line max-h-[60vh] divide-y overflow-y-auto" aria-label="Notification list">
              {items.map((n) => {
                const kind = ICONS[n.event] ?? ICONS.chat_assigned;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "hover:bg-hover flex w-full items-start gap-3 px-4 py-3 text-left",
                        !n.read && "bg-primary-soft/40"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          kind.className
                        )}
                      >
                        <kind.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("text-fg block text-sm", !n.read && "font-semibold")}>
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="text-fg-subtle line-clamp-2 block text-xs">{n.body}</span>
                        )}
                        <span className="text-fg-faint block text-[11px]">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.read && (
                        <span
                          className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
