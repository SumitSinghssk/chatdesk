"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";

import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { notificationsApi, type AppNotification } from "@/app/admin/_lib/api/notificationsApi";
import { cn, timeAgo } from "@/lib/utils";

import { headerButton } from "./headerStyles";

import { ADMIN_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  useClickOutside(ref, () => setOpen(false), open);

  const { data } = useQuery({
    queryKey: [QK.NOTIFICATIONS, "latest"],
    queryFn: notificationsApi.latest,
    refetchInterval: 60_000,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QK.NOTIFICATIONS] });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  const openItem = async (item: AppNotification) => {
    setOpen(false);
    if (!item.read_at) notificationsApi.markRead(item.id).then(invalidate);
    if (item.url) router.push(item.url);
  };

  const unread = data?.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={headerButton}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unread} unread)`}
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="tabular ring-page absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="border-line bg-surface absolute right-0 z-100 mt-2 w-88 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border shadow-xl">
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <p className="text-fg text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!data?.items.length && (
              <p className="text-fg-subtle px-4 py-10 text-center text-sm">You&apos;re all caught up.</p>
            )}
            {data?.items.map((item) => (
              <button
                key={item.id}
                onClick={() => openItem(item)}
                className={cn(
                  "border-line hover:bg-page flex w-full gap-3 border-b px-4 py-3 text-left last:border-0",
                  !item.read_at && "bg-primary-soft/40"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    item.read_at ? "bg-transparent" : "bg-primary"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block text-sm font-semibold">{item.title}</span>
                  {item.message && (
                    <span className="text-fg-subtle line-clamp-2 block text-xs">{item.message}</span>
                  )}
                  <span className="text-fg-faint mt-0.5 block text-[11px]">{timeAgo(item.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link
            href={ADMIN_ROUTES.NOTIFICATIONS()}
            onClick={() => setOpen(false)}
            className="border-line text-primary hover:bg-page block border-t py-2.5 text-center text-xs font-semibold"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
