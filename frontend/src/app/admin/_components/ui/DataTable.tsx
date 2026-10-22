"use client";

import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";

import type { BulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import type { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { cn } from "@/lib/utils";

import { Checkbox } from "./Checkbox";
import { EmptyState, Skeleton } from "./Feedback";

const INTERACTIVE =
  "a, button, input, textarea, label, [role=button], [role=switch], [role=checkbox], [role=menuitem]";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => number;
  loading?: boolean;
  selection?: BulkSelection;
  isSelectable?: (row: T) => boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  highlightId?: number | null;
  stickyHeader?: boolean;
  sort?: ReturnType<typeof useDragSort>;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  selection,
  isSelectable = () => true,
  empty,
  onRowClick,
  highlightId,
  stickyHeader,
  sort,
}: DataTableProps<T>) {
  const selectableIds = (rows ?? []).filter(isSelectable).map(getRowId);
  const pageState = selection?.pageState(selectableIds) ?? "none";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left">
        <thead className={cn(stickyHeader && "[&_th]:bg-page sticky top-0 z-10")}>
          <tr>
            {sort && (
              <th aria-label="Reorder" className="border-line bg-page/70 w-8 border-b py-2.5 pr-0 pl-3" />
            )}
            {selection && (
              <th className="border-line bg-page/70 w-10 border-b py-2.5 pr-0 pl-4">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={pageState === "all"}
                  indeterminate={pageState === "some"}
                  disabled={selectableIds.length === 0}
                  onChange={() => selection.togglePage(selectableIds)}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "border-line bg-page/70 text-fg-subtle border-b px-4 py-2.5 text-xs font-medium whitespace-nowrap",
                  col.hideOnMobile && "hidden md:table-cell",
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {sort && <td className="border-line border-b" />}
                {selection && <td className="border-line border-b px-4 py-3" />}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "border-line border-b px-4 py-3",
                      col.hideOnMobile && "hidden md:table-cell"
                    )}
                  >
                    <Skeleton className="h-4 w-full max-w-45" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading &&
            rows?.map((row, index) => {
              const id = getRowId(row);
              const selected = selection?.isSelected(id);
              const drop = sort?.indicator(index);
              return (
                <tr
                  key={id}
                  data-sort-item={sort ? "" : undefined}
                  {...sort?.itemProps(index)}
                  onClick={
                    onRowClick
                      ? (e) => {
                          const target = e.target as HTMLElement;
                          if (!e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                  className={cn(
                    "group/row hover:bg-page align-middle transition-colors [&:last-child>td]:border-b-0",
                    selected && "bg-primary-soft/60 hover:bg-primary-soft/60",
                    highlightId === id && "bg-warning-soft",
                    onRowClick && "cursor-pointer",
                    sort?.isDragging(index) && "opacity-40",
                    drop === "before" && "[&>td]:shadow-[inset_0_2px_0_var(--primary)]",
                    drop === "after" && "[&>td]:shadow-[inset_0_-2px_0_var(--primary)]"
                  )}
                >
                  {sort && (
                    <td className="border-line w-8 border-b py-3 pr-0 pl-3">
                      <span
                        {...sort.handleProps(index)}
                        role="button"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                        className="text-fg-faint hover:text-fg flex cursor-grab items-center active:cursor-grabbing"
                      >
                        <GripVertical size={16} aria-hidden />
                      </span>
                    </td>
                  )}
                  {selection && (
                    <td className="border-line border-b py-3 pr-0 pl-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label="Select row"
                        checked={!!selected}
                        disabled={!isSelectable(row)}
                        onChange={() => selection.toggle(id)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "border-line text-fg-muted border-b px-4 py-3 text-sm",
                        col.hideOnMobile && "hidden md:table-cell",
                        col.className
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
      {!loading &&
        rows?.length === 0 &&
        (empty ?? <EmptyState title="Nothing here yet" description="Try changing the filters." />)}
    </div>
  );
}
