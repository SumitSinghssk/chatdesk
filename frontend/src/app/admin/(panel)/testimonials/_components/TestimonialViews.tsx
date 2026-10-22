import type { ReactNode } from "react";
import { GripVertical, Star } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar, Badge } from "@/app/admin/_components/ui/index";
import type { useDragSort } from "@/app/admin/_hooks/useDragSort";
import type { Testimonial } from "@/app/admin/_lib/api/testimonialsApi";
import { cn } from "@/lib/utils";

export function Stars({ rating, size = 13 }: { rating: number | null; size?: number }) {
  if (!rating) return <span className="text-fg-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={cn(i < rating ? "fill-warning text-warning" : "text-line")} />
      ))}
    </span>
  );
}

const byline = (row: Testimonial) => [row.designation, row.company].filter(Boolean).join(", ");

export function TestimonialListItem({
  row,
  slots,
  index,
  drag,
  status,
  actions,
}: {
  row: Testimonial;
  slots: RowSlots;
  index: number;
  drag?: ReturnType<typeof useDragSort>;
  status: ReactNode;
  actions: ReactNode;
}) {
  const drop = drag?.indicator(index);
  return (
    <div
      data-sort-item={drag ? "" : undefined}
      {...drag?.itemProps(index)}
      className={cn(
        "flex items-center gap-3 rounded-sm",
        drag?.isDragging(index) && "opacity-40",
        drop === "before" && "shadow-[0_-2px_0_var(--primary)]",
        drop === "after" && "shadow-[0_2px_0_var(--primary)]"
      )}
    >
      {drag && (
        <span
          {...drag.handleProps(index)}
          role="button"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          className="text-fg-faint hover:text-fg flex shrink-0 cursor-grab items-center active:cursor-grabbing"
        >
          <GripVertical size={16} aria-hidden />
        </span>
      )}
      {slots.checkbox}
      <Avatar name={row.name} src={row.photo} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-fg truncate font-semibold">{row.name}</span>
          {row.is_featured && <Badge tone="purple">Featured</Badge>}
          <Stars rating={row.rating} size={12} />
        </div>
        <p className="text-fg-subtle truncate text-xs">
          {byline(row) && <>{byline(row)} · </>}“{row.quote}”
        </p>
      </div>
      <span className="shrink-0">{status}</span>
      <span className="hidden shrink-0 sm:block">{actions}</span>
    </div>
  );
}

export function TestimonialCard({
  row,
  slots,
  status,
  actions,
}: {
  row: Testimonial;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={row.name} src={row.photo} size={42} />
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate font-semibold">{row.name}</p>
          <p className="text-fg-subtle truncate text-xs">{byline(row) || "—"}</p>
        </div>
        {slots.checkbox}
      </div>

      <div className="mt-3 flex min-h-5 items-center gap-2">
        <Stars rating={row.rating} />
        {row.is_featured && <Badge tone="purple">Featured</Badge>}
      </div>

      <blockquote className="text-fg-muted mt-2 mb-4 line-clamp-4 text-sm italic">“{row.quote}”</blockquote>

      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        {status}
        {actions}
      </div>
    </>
  );
}
