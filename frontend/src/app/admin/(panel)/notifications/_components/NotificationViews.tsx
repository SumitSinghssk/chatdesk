import {
  Bell,
  Check,
  DatabaseBackup,
  ExternalLink,
  Inbox,
  Lock,
  MailOpen,
  ShieldAlert,
  Trash2,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Button } from "@/app/admin/_components/ui/index";
import type { AppNotification } from "@/app/admin/_lib/api/notificationsApi";
import { cn, formatDateTime, timeAgo, titleCase } from "@/lib/utils";

const TYPE_META: Record<string, { label: string; icon: LucideIcon; tone: string; dot: string }> = {
  "enquiry.new": {
    label: "New enquiry",
    icon: Inbox,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  "enquiry.assigned": {
    label: "Enquiry assigned",
    icon: UserCheck,
    tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
  "auth.locked": {
    label: "Account locked",
    icon: Lock,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  "security.auto_block": {
    label: "IP blocked",
    icon: ShieldAlert,
    tone: "bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  "backup.failed": {
    label: "Backup failed",
    icon: DatabaseBackup,
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
  },
};
const FALLBACK_DOTS = ["bg-violet-500", "bg-emerald-500", "bg-slate-400", "bg-teal-500"];

export function typeMeta(type: string, i = 0) {
  return (
    TYPE_META[type] ?? {
      label: titleCase(type.replace(/[._]/g, " ")),
      icon: Bell,
      tone: "bg-slate-500/10 text-slate-500",
      dot: FALLBACK_DOTS[i % FALLBACK_DOTS.length]!,
    }
  );
}

export interface NotificationRowActions {
  onOpen: (n: AppNotification) => void;
  onToggleRead: (n: AppNotification) => void;
  onDelete: (n: AppNotification) => void;
}

export function TypeIcon({ n, size = 36 }: { n: AppNotification; size?: number }) {
  const meta = typeMeta(n.type);
  const Icon = meta.icon;
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        n.read_at ? "bg-hover text-fg-subtle" : meta.tone
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function NotificationButtons({ n, actions }: { n: AppNotification; actions: NotificationRowActions }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {n.url && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={ExternalLink}
          aria-label="Open"
          title="Open"
          onClick={() => actions.onOpen(n)}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        leftIcon={n.read_at ? MailOpen : Check}
        aria-label={n.read_at ? "Mark as unread" : "Mark as read"}
        title={n.read_at ? "Mark as unread" : "Mark as read"}
        onClick={() => actions.onToggleRead(n)}
      />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        leftIcon={Trash2}
        aria-label="Delete notification"
        title="Delete"
        className="hover:bg-danger-soft hover:text-danger"
        onClick={() => actions.onDelete(n)}
      />
    </div>
  );
}

export function NotificationListItem({
  n,
  slots,
  actions,
}: {
  n: AppNotification;
  slots: RowSlots;
  actions: NotificationRowActions;
}) {
  const unread = !n.read_at;
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-2">{slots.checkbox}</span>}
      <TypeIcon n={n} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {unread && <span className="bg-primary h-2 w-2 shrink-0 rounded-full" aria-label="Unread" />}
          <button
            type="button"
            onClick={() => actions.onOpen(n)}
            className={cn(
              "text-fg hover:text-primary truncate text-left text-sm",
              unread ? "font-bold" : "font-medium"
            )}
          >
            {n.title}
          </button>
          <span className="text-fg-subtle ml-auto shrink-0 text-xs" title={formatDateTime(n.created_at)}>
            {timeAgo(n.created_at)}
          </span>
        </div>
        {n.message && <p className="text-fg-muted mt-0.5 line-clamp-2 text-sm">{n.message}</p>}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-fg-subtle truncate text-xs">{typeMeta(n.type).label}</span>
          <div className="-my-1 ml-auto">
            <NotificationButtons n={n} actions={actions} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationCard({
  n,
  slots,
  actions,
}: {
  n: AppNotification;
  slots: RowSlots;
  actions: NotificationRowActions;
}) {
  const unread = !n.read_at;
  return (
    <>
      <div className="flex items-start gap-3">
        <TypeIcon n={n} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-fg-subtle truncate text-xs font-medium">{typeMeta(n.type).label}</p>
          <button
            type="button"
            onClick={() => actions.onOpen(n)}
            className={cn(
              "text-fg hover:text-primary line-clamp-2 text-left text-sm",
              unread ? "font-bold" : "font-semibold"
            )}
          >
            {unread && (
              <span
                className="bg-primary mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                aria-label="Unread"
              />
            )}
            {n.title}
          </button>
        </div>
        {slots.checkbox}
      </div>
      <p className="text-fg-muted mt-3 mb-4 line-clamp-3 min-h-[3.75em] text-sm">
        {n.message || <span className="text-fg-faint">No details</span>}
      </p>
      <div className="border-line mt-auto flex items-center gap-2 border-t pt-2 text-xs">
        <span className="text-fg-subtle" title={formatDateTime(n.created_at)}>
          {timeAgo(n.created_at)}
        </span>
        <div className="ml-auto">
          <NotificationButtons n={n} actions={actions} />
        </div>
      </div>
    </>
  );
}
