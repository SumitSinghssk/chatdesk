import Link from "next/link";
import { AlarmClock, Building2, Mail, Phone } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar, StatusBadge } from "@/app/admin/_components/ui/index";
import type { Enquiry } from "@/app/admin/_lib/api/enquiriesApi";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { STATUS_LABELS, sourceLabel } from "./constants";

export function EnquiryListItem({
  row,
  slots,
  href,
  now,
}: {
  row: Enquiry;
  slots: RowSlots;
  href: string;
  now: number;
}) {
  const unseen = !row.seen_at;
  const overdue = !!row.follow_up_at && new Date(row.follow_up_at).getTime() < now;
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-0.5">{slots.checkbox}</span>}
      <Avatar name={row.name} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {unseen && <span className="bg-primary h-2 w-2 shrink-0 rounded-full" aria-label="Unread" />}
          <Link
            href={href}
            scroll={false}
            className={cn("text-fg hover:text-primary truncate", unseen ? "font-bold" : "font-medium")}
          >
            {row.name}
          </Link>
          <span className="text-fg-faint hidden shrink-0 font-mono text-[11px] sm:inline">
            {row.reference}
          </span>
          <span className="text-fg-subtle ml-auto shrink-0 text-xs" title={formatDateTime(row.created_at)}>
            {timeAgo(row.created_at)}
          </span>
        </div>
        <p className="text-fg-muted mt-0.5 truncate text-sm">
          {row.subject && <span className={cn(unseen && "text-fg font-semibold")}>{row.subject} — </span>}
          <span className="text-fg-subtle">{row.message_preview}</span>
        </p>
        <div className="text-fg-subtle mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />
          <span>{sourceLabel(row.source)}</span>
          {row.assignee ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={row.assignee.name} size={16} />
              {row.assignee.name}
            </span>
          ) : (
            <span className="text-fg-faint">Unassigned</span>
          )}
          {row.follow_up_at && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-danger font-medium")}>
              <AlarmClock className="h-3.5 w-3.5" />
              {formatDateTime(row.follow_up_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function EnquiryCard({
  row,
  slots,
  href,
  now,
}: {
  row: Enquiry;
  slots: RowSlots;
  href: string;
  now: number;
}) {
  const unseen = !row.seen_at;
  const overdue = !!row.follow_up_at && new Date(row.follow_up_at).getTime() < now;
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={row.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {unseen && <span className="bg-primary h-2 w-2 shrink-0 rounded-full" aria-label="Unread" />}
            <Link
              href={href}
              scroll={false}
              className={cn("text-fg hover:text-primary truncate", unseen ? "font-bold" : "font-semibold")}
            >
              {row.name}
            </Link>
          </div>
          <p className="text-fg-faint font-mono text-[11px]">{row.reference}</p>
        </div>
        {slots.checkbox}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />
        <span className="text-fg-subtle text-xs">{sourceLabel(row.source)}</span>
      </div>

      <p className={cn("mt-3 truncate text-sm", unseen ? "text-fg font-semibold" : "text-fg")}>
        {row.subject || "No subject"}
      </p>
      <p className="text-fg-subtle mt-1 line-clamp-2 min-h-[2.5em] text-sm">{row.message_preview}</p>

      <div className="text-fg-subtle mt-3 mb-4 space-y-1 text-xs">
        {row.email && (
          <p className="flex items-center gap-1.5 truncate">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.email}</span>
          </p>
        )}
        {row.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {row.phone}
          </p>
        )}
        {row.company && (
          <p className="flex items-center gap-1.5 truncate">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.company}</span>
          </p>
        )}
      </div>

      <div className="border-line mt-auto flex items-center gap-2 border-t pt-3 text-xs">
        {row.assignee ? (
          <span className="text-fg-muted inline-flex min-w-0 items-center gap-1.5">
            <Avatar name={row.assignee.name} size={18} />
            <span className="truncate">{row.assignee.name}</span>
          </span>
        ) : (
          <span className="text-fg-faint">Unassigned</span>
        )}
        {row.follow_up_at ? (
          <span
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1",
              overdue ? "text-danger font-medium" : "text-fg-subtle"
            )}
            title={`Follow-up ${formatDateTime(row.follow_up_at)}`}
          >
            <AlarmClock className="h-3.5 w-3.5" />
            {formatDateTime(row.follow_up_at)}
          </span>
        ) : (
          <span className="text-fg-subtle ml-auto shrink-0" title={formatDateTime(row.created_at)}>
            {timeAgo(row.created_at)}
          </span>
        )}
      </div>
    </>
  );
}
