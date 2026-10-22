import type { ReactNode } from "react";
import { FileText, FolderOpen } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import type { MediaFile } from "@/app/admin/_lib/api/mediaApi";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

import { isImage } from "./MediaDetails";

export interface MediaViewProps {
  row: MediaFile;
  slots: RowSlots;
  actions: ReactNode;
}

export const fileName = (f: MediaFile) => f.original_name || f.filename;

export function dimensions(f: MediaFile) {
  return f.width && f.height ? `${f.width}×${f.height}` : null;
}

export function MediaThumb({
  file,
  className,
  large,
}: {
  file: MediaFile;
  className?: string;
  large?: boolean;
}) {
  if (isImage(file))
    return (
      <img
        src={file.url}
        alt={file.alt ?? ""}
        loading="lazy"
        className={cn("shrink-0 object-cover", className)}
      />
    );
  return (
    <span
      className={cn(
        "bg-page text-fg-subtle flex shrink-0 flex-col items-center justify-center gap-0.5",
        className
      )}
    >
      <FileText size={large ? 30 : 16} />
      <span className={cn("font-semibold uppercase", large ? "text-[11px]" : "text-[9px]")}>
        {file.extension || "file"}
      </span>
    </span>
  );
}

export function MediaListItem({ row, slots, actions }: MediaViewProps) {
  const dims = dimensions(row);
  return (
    <div className="flex items-center gap-3">
      {slots.checkbox}
      <MediaThumb file={row} className="h-12 w-12 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="text-fg truncate text-sm font-medium" title={fileName(row)}>
          {fileName(row)}
        </p>
        <div className="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span>{formatBytes(row.size)}</span>
          {dims && <span>{dims}</span>}
          <span className="inline-flex items-center gap-1">
            <FolderOpen size={12} /> {row.folder}
          </span>
          <span className="hidden sm:inline">{timeAgo(row.created_at)}</span>
          {isImage(row) && !row.alt && <span className="text-warning">No alt text</span>}
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}

export function MediaCard({ row, slots, actions }: MediaViewProps) {
  const dims = dimensions(row);
  return (
    <>
      <div className="relative -mx-4 -mt-4 mb-3">
        <MediaThumb file={row} large className="aspect-4/3 w-full rounded-t-xl" />
        {slots.checkbox && (
          <span className="bg-surface/90 absolute top-2 left-2 rounded-md p-1 shadow-xs">
            {slots.checkbox}
          </span>
        )}
        <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white uppercase">
          {row.extension || "file"}
        </span>
      </div>
      <p className="text-fg truncate text-sm font-medium" title={fileName(row)}>
        {fileName(row)}
      </p>
      <p className="text-fg-subtle mt-0.5 mb-3 truncate text-xs">
        {formatBytes(row.size)}
        {dims && ` · ${dims}`} · {row.folder}
      </p>
      <div className="border-line mt-auto flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-fg-subtle truncate text-xs">{timeAgo(row.created_at)}</span>
        {actions}
      </div>
    </>
  );
}
