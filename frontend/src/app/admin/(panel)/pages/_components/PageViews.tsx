import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, ImageIcon, UserRound } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge, StatusBadge, Switch } from "@/app/admin/_components/ui/index";
import type { Page } from "@/app/admin/_lib/api/pagesApi";
import { cn, formatDate } from "@/lib/utils";

export interface PageViewProps {
  row: Page;
  slots: RowSlots;
  href: string;
  now: number;
  onToggle?: () => void;
  actions: ReactNode;
}

export function isScheduled(row: Page, now: number) {
  return row.status === "published" && !!row.published_at && new Date(row.published_at).getTime() > now;
}

export function PublishControl({ row, now, onToggle }: { row: Page; now: number; onToggle?: () => void }) {
  const published = row.status === "published";
  return (
    <span className="inline-flex items-center gap-2">
      {onToggle ? (
        <Switch
          size="sm"
          checked={published}
          onChange={onToggle}
          aria-label={published ? "Unpublish page" : "Publish page"}
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

function dateLabel(row: Page, now: number) {
  if (row.status !== "published") return `Edited ${formatDate(row.updated_at)}`;
  return isScheduled(row, now) ? `Goes live ${formatDate(row.published_at)}` : formatDate(row.published_at);
}

export function PageListItem({ row, slots, href, now, onToggle, actions }: PageViewProps) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <Thumb src={row.featured_image} className="h-11 w-14 rounded-md sm:w-16" />
      <div className="min-w-0 flex-1">
        <Link href={href} scroll={false} className="text-fg hover:text-primary line-clamp-1 font-semibold">
          {row.title}
        </Link>
        <p className="text-fg-subtle truncate font-mono text-xs">/{row.slug}</p>
        <div className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <PublishControl row={row} now={now} onToggle={onToggle} />
          <span className="whitespace-nowrap">{dateLabel(row, now)}</span>
          {row.author && <span className="hidden sm:inline">{row.author.name}</span>}
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

export function PageCard({ row, slots, href, now, onToggle, actions }: PageViewProps) {
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
      <Link href={href} scroll={false} className="text-fg hover:text-primary line-clamp-2 font-semibold">
        {row.title}
      </Link>
      <p className="text-fg-subtle mt-0.5 mb-3 truncate font-mono text-xs">/{row.slug}</p>
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
      </div>
      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <PublishControl row={row} now={now} onToggle={onToggle} />
        {actions}
      </div>
    </>
  );
}
