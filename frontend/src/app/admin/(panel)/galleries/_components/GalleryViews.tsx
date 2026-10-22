import Link from "next/link";
import { CalendarDays, Images, MoreVertical, Star, Video } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Badge, Button, Dropdown, StatusBadge } from "@/app/admin/_components/ui/index";
import type { Gallery } from "@/app/admin/_lib/api/galleriesApi";
import { cn, formatDate } from "@/lib/utils";

export type GalleryMenu = Parameters<typeof Dropdown>[0]["items"];

export interface GalleryViewProps {
  row: Gallery;
  slots: RowSlots;
  href: string;
  menu: GalleryMenu;
}

export function GalleryMenuButton({ title, menu }: { title: string; menu: GalleryMenu }) {
  return (
    <Dropdown
      items={menu}
      trigger={() => (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={MoreVertical}
          aria-label={`Actions for ${title}`}
        />
      )}
    />
  );
}

export function GalleryCover({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className={cn("shrink-0 object-cover", className)} />
  ) : (
    <span className={cn("bg-page text-fg-subtle flex shrink-0 items-center justify-center", className)}>
      <Images size={18} />
    </span>
  );
}

export function GalleryCounts({ row, className }: { row: Gallery; className?: string }) {
  return (
    <span className={cn("text-fg-subtle inline-flex items-center gap-3 text-xs", className)}>
      <span className="inline-flex items-center gap-1" title={`${row.image_count} photos`}>
        <Images size={12} /> {row.image_count}
      </span>
      <span className="inline-flex items-center gap-1" title={`${row.youtube_count} videos`}>
        <Video size={12} /> {row.youtube_count}
      </span>
    </span>
  );
}

export function GalleryListItem({ row, slots, href, menu }: GalleryViewProps) {
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <GalleryCover src={row.cover_image} className="h-12 w-16 rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={href} scroll={false} className="text-fg hover:text-primary truncate font-semibold">
            {row.title}
          </Link>
          {row.is_featured && (
            <Star size={13} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <StatusBadge status={row.status} />
          <GalleryCounts row={row} />
          {row.event_date && (
            <span className="text-fg-subtle inline-flex items-center gap-1">
              <CalendarDays size={12} /> {formatDate(row.event_date)}
            </span>
          )}
        </div>
      </div>
      <GalleryMenuButton title={row.title} menu={menu} />
    </div>
  );
}

export function GalleryCard({ row, slots, href, menu }: GalleryViewProps) {
  return (
    <>
      <div className="group relative -mx-4 -mt-4 mb-3 overflow-hidden rounded-t-xl">
        <GalleryCover
          src={row.cover_image}
          className="aspect-4/3 w-full transition duration-300 group-hover:scale-[1.02] [&>svg]:h-8 [&>svg]:w-8"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {slots.checkbox && <span className="bg-surface/90 rounded-md p-1 shadow-xs">{slots.checkbox}</span>}
          {row.is_featured && (
            <Badge tone="purple">
              <Star size={11} className="fill-current" /> Featured
            </Badge>
          )}
        </div>
        <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {row.items_count} {row.items_count === 1 ? "item" : "items"}
        </span>
      </div>
      <Link href={href} scroll={false} className="text-fg hover:text-primary line-clamp-1 font-semibold">
        {row.title}
      </Link>
      {row.description && <p className="text-fg-subtle mt-0.5 line-clamp-2 text-sm">{row.description}</p>}
      <div className="mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <GalleryCounts row={row} />
        {row.event_date && (
          <span className="text-fg-subtle inline-flex items-center gap-1 text-xs">
            <CalendarDays size={12} /> {formatDate(row.event_date)}
          </span>
        )}
      </div>
      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <StatusBadge status={row.status} />
        <GalleryMenuButton title={row.title} menu={menu} />
      </div>
    </>
  );
}
