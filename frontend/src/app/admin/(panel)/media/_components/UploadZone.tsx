"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";

export function UploadZone({
  onFiles,
  accept,
  progress,
  disabled,
  title,
  hint,
  compact,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  progress: number | null;
  disabled?: boolean;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const uploading = progress !== null;
  const blocked = disabled || uploading;

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(files);
    if (input.current) input.current.value = "";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!blocked) pick(e.dataTransfer.files);
      }}
      className={cn(
        "bg-page relative rounded-xl border-2 border-dashed transition-colors",
        over ? "border-primary bg-primary-soft" : "border-line hover:border-primary/60"
      )}
    >
      <input ref={input} type="file" multiple accept={accept} hidden onChange={(e) => pick(e.target.files)} />
      <button
        type="button"
        disabled={blocked}
        onClick={() => input.current?.click()}
        className={cn(
          "focus-visible:ring-primary/40 flex w-full flex-col items-center gap-1.5 rounded-xl px-4 text-center focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed",
          compact ? "py-4" : "py-7"
        )}
      >
        <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-full">
          <UploadCloud size={20} />
        </span>
        <span className="text-fg text-sm font-medium">{uploading ? `Uploading… ${progress}%` : title}</span>
        {hint && !uploading && <span className="text-fg-subtle text-xs">{hint}</span>}
      </button>
      {uploading && (
        <div
          className="bg-line absolute inset-x-4 bottom-2.5 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="bg-primary h-full rounded-full transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
