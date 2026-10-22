import type { ReactNode } from "react";
import { GripVertical, Mail, Phone } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar, Badge } from "@/app/admin/_components/ui/index";
import type { useDragSort } from "@/app/admin/_hooks/useDragSort";
import type { TeamMember } from "@/app/admin/_lib/api/teamApi";
import { cn } from "@/lib/utils";

const byline = (row: TeamMember) => [row.designation, row.department].filter(Boolean).join(" · ");

export function TeamListItem({
  row,
  slots,
  index,
  drag,
  status,
  actions,
}: {
  row: TeamMember;
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
      <Avatar name={row.name} src={row.photo} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-fg truncate font-semibold">{row.name}</span>
          {row.is_featured && <Badge tone="purple">Featured</Badge>}
        </div>
        <p className="text-fg-subtle truncate text-xs">{byline(row) || row.email || "—"}</p>
      </div>
      <span className="shrink-0">{status}</span>
      <span className="hidden shrink-0 sm:block">{actions}</span>
    </div>
  );
}

export function TeamCard({
  row,
  slots,
  status,
  actions,
}: {
  row: TeamMember;
  slots: RowSlots;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <>
      <div className="relative flex flex-col items-center text-center">
        <span className="absolute top-0 right-0">{slots.checkbox}</span>
        <Avatar name={row.name} src={row.photo} size={72} />
        <p className="text-fg mt-3 line-clamp-1 font-semibold">{row.name}</p>
        <p className="text-fg-subtle line-clamp-1 text-xs">{byline(row) || "—"}</p>
        <div className="mt-2 min-h-5">{row.is_featured && <Badge tone="purple">Featured</Badge>}</div>
      </div>

      <p className="text-fg-muted mt-2 mb-3 line-clamp-3 min-h-[3.75em] text-center text-sm">
        {row.bio || "No bio yet"}
      </p>

      <div className="text-fg-subtle mb-3 flex min-h-4 flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {row.email && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.email}</span>
          </span>
        )}
        {row.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {row.phone}
          </span>
        )}
      </div>

      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-3">
        {status}
        {actions}
      </div>
    </>
  );
}
