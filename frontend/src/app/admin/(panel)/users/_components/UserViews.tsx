import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Lock, Mail, Phone, ShieldCheck } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar, Badge } from "@/app/admin/_components/ui/index";
import { roleLabel } from "@/app/admin/_lib/api/rolesApi";
import type { User } from "@/app/admin/_lib/api/usersApi";
import { formatDateTime, timeAgo } from "@/lib/utils";

function UserAvatar({ row, size }: { row: User; size: number }) {
  return (
    <span className="relative shrink-0">
      <Avatar name={row.name} src={row.avatar} size={size} />
      {row.is_online && (
        <span
          className="bg-success ring-surface absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2"
          title="Online now"
        />
      )}
    </span>
  );
}

function UserBadges({ row, isMe }: { row: User; isMe: boolean }) {
  return (
    <>
      {isMe && <Badge tone="blue">You</Badge>}
      {row.is_locked && (
        <Badge tone="red">
          <Lock size={10} aria-hidden /> Locked
        </Badge>
      )}
      {row.two_factor_enabled && (
        <Badge tone="green">
          <ShieldCheck size={10} aria-hidden /> 2FA
        </Badge>
      )}
    </>
  );
}

export function UserListItem({
  row,
  slots,
  href,
  isMe,
  status,
  actions,
}: {
  row: User;
  slots: RowSlots;
  href: string;
  isMe: boolean;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <UserAvatar row={row} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Link href={href} scroll={false} className="text-fg hover:text-primary truncate font-semibold">
            {row.name}
          </Link>
          <UserBadges row={row} isMe={isMe} />
        </div>
        <p className="text-fg-subtle truncate text-xs">
          {row.email}
          <span className="hidden sm:inline">
            {" · "}
            {row.role ? roleLabel(row.role.name) : "No role"}
            {" · "}
            <span title={formatDateTime(row.last_login_at)}>
              {row.last_login_at ? `last login ${timeAgo(row.last_login_at)}` : "never signed in"}
            </span>
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status}
        <span className="hidden sm:block">{actions}</span>
      </div>
    </div>
  );
}

export function UserCard({
  row,
  slots,
  href,
  isMe,
  status,
  actions,
}: {
  row: User;
  slots: RowSlots;
  href: string;
  isMe: boolean;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <UserAvatar row={row} size={44} />
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            scroll={false}
            className="text-fg hover:text-primary block truncate font-semibold"
          >
            {row.name}
          </Link>
          <p className="text-fg-subtle truncate text-xs">{row.role ? roleLabel(row.role.name) : "No role"}</p>
        </div>
        {slots.checkbox}
      </div>

      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-1.5">
        <UserBadges row={row} isMe={isMe} />
      </div>

      <div className="text-fg-subtle mt-3 mb-4 space-y-1 text-xs">
        <p className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{row.email}</span>
        </p>
        {row.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {row.phone}
          </p>
        )}
        <p className="flex items-center gap-1.5" title={formatDateTime(row.last_login_at)}>
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {row.last_login_at ? `Last login ${timeAgo(row.last_login_at)}` : "Never signed in"}
        </p>
      </div>

      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        {status}
        {actions}
      </div>
    </>
  );
}
