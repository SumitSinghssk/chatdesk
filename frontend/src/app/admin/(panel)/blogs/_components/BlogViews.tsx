import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, ImageIcon, MessageSquareOff, MessagesSquare, UserRound } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge, StatusBadge, Switch } from "@/app/admin/_components/ui/index";
import type { Blog } from "@/app/admin/_lib/api/blogsApi";
import { ADMIN_ROUTES } from "@/config/routes";
import { cn, formatDate } from "@/lib/utils";

export interface BlogViewProps {
  row: Blog;
  slots: RowSlots;
  href: string;
  now: number;
  onToggle?: () => void;
  actions: ReactNode;
  canViewComments?: boolean;
}

export function CommentCount({ row, linked }: { row: Blog; linked: boolean }) {
  const total = row.comments_count ?? 0;
  const pending = row.pending_comments ?? 0;
  const label = `${total} comment${total === 1 ? "" : "s"}${pending ? `, ${pending} awaiting approval` : ""}`;
  const content = (
    <>
      {row.comments_enabled ? (
        <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <MessageSquareOff className="h-3.5 w-3.5 shrink-0" aria-label="Comments closed" />
      )}
      <span className="tabular-nums">{total}</span>
      {pending > 0 && (
        <span className="bg-warning-soft text-warning rounded-full px-1.5 text-[10px] leading-4 font-semibold tabular-nums">
          {pending} new
        </span>
      )}
    </>
  );
  if (!linked) {
    return (
      <span title={label} className="text-fg-subtle inline-flex items-center gap-1 text-xs">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={ADMIN_ROUTES.COMMENTS({ blog_id: row.id })}
      title={`${label}. View comments`}
      onClick={(e) => e.stopPropagation()}
      className="text-fg-subtle hover:text-primary inline-flex items-center gap-1 text-xs"
    >
      {content}
    </Link>
  );
}

export function isScheduled(row: { status: string; published_at: string | null }, now: number) {
  return row.status === "published" && !!row.published_at && new Date(row.published_at).getTime() > now;
}

export function PublishControl({
  row,
  now,
  onToggle,
  noun = "post",
}: {
  row: { status: string; published_at: string | null };
  now: number;
  onToggle?: () => void;
  noun?: string;
}) {
  const published = row.status === "published";
  return (
    <span className="inline-flex items-center gap-2">
      {onToggle ? (
        <Switch
          size="sm"
          checked={published}
          onChange={onToggle}
          aria-label={published ? `Unpublish ${noun}` : `Publish ${noun}`}
        />
      ) : (
        <StatusBadge status={row.status} />
      )}
      {isScheduled(row, now) ? (
        <Badge tone="info">Scheduled</Badge>
      ) : (
        onToggle && <span className="text-fg-subtle text-xs">{published ? "Published" : "Draft"}</span>
      )}
    </span>
  );
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className={cn("shrink-0 object-cover", className)} />
  ) : (
    <span className={cn("bg-page text-fg-subtle flex shrink-0 items-center justify-center", className)}>
      <ImageIcon size={16} />
    </span>
  );
}

function dateLabel(row: Blog, now: number) {
  if (row.status !== "published") return `Edited ${formatDate(row.updated_at)}`;
  return isScheduled(row, now) ? `Goes live ${formatDate(row.published_at)}` : formatDate(row.published_at);
}

export function BlogListItem({ row, slots, href, now, onToggle, actions, canViewComments }: BlogViewProps) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <Thumb src={row.featured_image} className="h-12 w-16 rounded-md sm:h-14 sm:w-20" />
      <div className="min-w-0 flex-1">
        <Link href={href} scroll={false} className="text-fg hover:text-primary line-clamp-1 font-semibold">
          {row.title}
        </Link>
        <p className="text-fg-subtle hidden truncate text-sm sm:block">{row.excerpt || `/${row.slug}`}</p>
        <div className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <PublishControl row={row} now={now} onToggle={onToggle} />
          <span className="whitespace-nowrap">{dateLabel(row, now)}</span>
          {row.author && <span className="hidden sm:inline">{row.author.name}</span>}
          <CommentCount row={row} linked={!!canViewComments} />
          {row.categories.slice(0, 2).map((c) => (
            <Badge key={c.id} tone="blue" className="hidden md:inline-flex">
              {c.name}
            </Badge>
          ))}
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

export function BlogCard({ row, slots, href, now, onToggle, actions, canViewComments }: BlogViewProps) {
  return (
    <>
      <div className="relative -mx-4 -mt-4 mb-3">
        <Thumb
          src={row.featured_image}
          className="aspect-video w-full rounded-t-xl [&>svg]:h-7 [&>svg]:w-7"
        />
        {slots.checkbox && (
          <span className="bg-surface/90 absolute top-2 left-2 rounded-md p-1 shadow-xs">
            {slots.checkbox}
          </span>
        )}
      </div>
      {row.categories.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {row.categories.slice(0, 3).map((c) => (
            <Badge key={c.id} tone="blue">
              {c.name}
            </Badge>
          ))}
        </div>
      )}
      <Link href={href} scroll={false} className="text-fg hover:text-primary line-clamp-2 font-semibold">
        {row.title}
      </Link>
      <p className="text-fg-subtle mt-1 mb-3 line-clamp-2 text-sm">{row.excerpt || `/${row.slug}`}</p>
      <div className="text-fg-subtle mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {dateLabel(row, now)}
        </span>
        {row.author && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.author.name}</span>
          </span>
        )}
        <CommentCount row={row} linked={!!canViewComments} />
      </div>
      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <PublishControl row={row} now={now} onToggle={onToggle} />
        {actions}
      </div>
    </>
  );
}
