"use client";

import { GripVertical, ImageIcon, Pencil, Play, Star, Trash2, type LucideIcon } from "lucide-react";

import { Badge, Button, Checkbox } from "@/app/admin/_components/ui/index";
import type { GalleryItem } from "@/app/admin/_lib/api/galleriesApi";
import type { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { cn } from "@/lib/utils";

type DragSort = ReturnType<typeof useDragSort>;

export function ItemTile({
  item,
  isCover,
  selecting,
  selected,
  onSelect,
  canEdit,
  busy,
  index,
  sort,
  onCover,
  onEdit,
  onDelete,
}: {
  item: GalleryItem;
  isCover: boolean;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
  canEdit: boolean;
  busy: boolean;
  index: number;
  sort?: DragSort;
  onCover: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = item.title || (item.type === "youtube" ? "YouTube video" : "Image");
  const preview = (
    <>
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title ?? ""}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="text-fg-subtle flex h-full items-center justify-center">
          <ImageIcon size={24} />
        </div>
      )}
      {item.type === "youtube" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
            <Play size={18} className="ml-0.5 fill-current" />
          </span>
        </span>
      )}
    </>
  );

  const drop = sort?.indicator(index);

  return (
    <li
      data-sort-item
      {...(sort ? { ...sort.itemProps(index), ...sort.handleProps(index) } : {})}
      className={cn(
        "group bg-surface relative rounded-xl border shadow-xs transition",
        selected ? "border-primary ring-primary/30 ring-2" : "border-line",
        sort && "cursor-grab active:cursor-grabbing",
        sort?.isDragging(index) && "opacity-40"
      )}
    >
      {drop && (
        <span
          aria-hidden
          className={cn(
            "bg-primary pointer-events-none absolute inset-y-0 z-10 w-1 rounded-full",
            drop === "before" ? "-left-2" : "-right-2"
          )}
        />
      )}
      {selecting ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Select ${label}`}
          className="bg-page focus-visible:ring-primary/40 relative block aspect-square w-full overflow-hidden rounded-t-xl focus:outline-none focus-visible:ring-2"
        >
          {preview}
          <span className="bg-surface/90 pointer-events-none absolute top-2 left-2 rounded p-0.5">
            <Checkbox checked={selected} onChange={() => undefined} aria-label="Selected" />
          </span>
        </button>
      ) : (
        <div className="bg-page relative aspect-square overflow-hidden rounded-t-xl">
          {preview}
          {canEdit && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 p-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              <span
                className="flex items-center gap-1 px-1 text-[11px] text-white/80"
                title="Drag to reorder"
              >
                <GripVertical size={14} aria-hidden /> Drag
              </span>
              <div className="flex">
                <TileButton icon={Star} label="Set as cover" disabled={busy || isCover} onClick={onCover} />
                <TileButton icon={Pencil} label="Edit title & caption" onClick={onEdit} />
                <TileButton icon={Trash2} label="Delete" disabled={busy} onClick={onDelete} />
              </div>
            </div>
          )}
        </div>
      )}
      {isCover && (
        <span className="pointer-events-none absolute top-2 right-2">
          <Badge tone="yellow">
            <Star size={11} className="fill-current" /> Cover
          </Badge>
        </span>
      )}
      <div className="px-2.5 py-2">
        <p className="text-fg truncate text-xs font-medium" title={label}>
          {label}
        </p>
        <p className="text-fg-subtle truncate text-[11px]">
          {item.caption || (item.type === "youtube" ? "Video" : "Photo")}
        </p>
      </div>
    </li>
  );
}

function TileButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="xs"
      variant="ghost"
      iconOnly
      leftIcon={icon}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="text-white hover:bg-white/20 hover:text-white"
    />
  );
}
