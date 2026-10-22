"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from "lucide-react";

import { adminPortalTarget } from "@/app/admin/_components/ui/portal";
import { cn } from "@/lib/utils";

import { downloadUrl, mediaUrl, type InboxMessage } from "../../_lib/inboxApi";
import { fileKind, mediaType } from "./fileKind";
import { bubbleTime, dayLabel } from "./format";

/**
 * Full-screen viewer for photos, videos and PDFs in a chat, like WhatsApp's media viewer:
 * download, open in a new tab, arrow keys / buttons to move through the chat's media, Esc to close.
 */
export function MediaViewer({
  items,
  index,
  contactName,
  onIndex,
  onClose,
}: {
  items: InboxMessage[];
  index: number;
  contactName: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const message = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  if (!message?.media || typeof document === "undefined") return null;
  const media = message.media;
  const url = mediaUrl(media.path);
  const kind = fileKind(media.mime, media.filename);
  const type = mediaType(message);
  const isPdf = type === "document" && kind.label === "PDF";
  const sender = message.direction === "out" ? (message.sent_by ?? "You") : contactName;
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      className="drawer-scrim fixed inset-0 z-140 flex flex-col bg-black/95 text-white"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className="flex h-16 shrink-0 items-center gap-3 px-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{sender}</p>
          <p className="truncate text-xs text-white/60">
            {dayLabel(message.created_at)}, {bubbleTime(message.created_at)}
            {media.filename && type === "document" ? ` · ${media.filename}` : ""}
            {items.length > 1 ? ` · ${index + 1} of ${items.length}` : ""}
          </p>
        </div>
        <a
          href={downloadUrl(media.path)}
          download={media.filename ?? true}
          className={btn}
          aria-label="Download"
          title="Download"
        >
          <Download className="h-5 w-5" />
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="h-5 w-5" />
        </a>
        <button type="button" onClick={onClose} className={btn} aria-label="Close" title="Close (Esc)">
          <X className="h-6 w-6" />
        </button>
      </header>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        {hasPrev && (
          <button
            type="button"
            aria-label="Previous"
            onClick={() => onIndex(index - 1)}
            className={cn(btn, "absolute left-2 z-10 bg-black/40 sm:left-4")}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {type === "image" || type === "sticker" ? (
          <img
            key={url}
            src={url}
            alt={message.text ?? "Photo"}
            className="max-h-full max-w-full rounded object-contain shadow-2xl"
          />
        ) : type === "video" ? (
          <video key={url} src={url} controls autoPlay className="max-h-full max-w-full rounded shadow-2xl" />
        ) : isPdf ? (
          <iframe
            key={url}
            src={url}
            title={media.filename ?? "Document"}
            className="h-full w-full max-w-5xl rounded bg-white"
          />
        ) : null}
        {hasNext && (
          <button
            type="button"
            aria-label="Next"
            onClick={() => onIndex(index + 1)}
            className={cn(btn, "absolute right-2 z-10 bg-black/40 sm:right-4")}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {message.text && type !== "document" && (
        <p className="mx-auto mb-5 max-w-2xl px-4 text-center text-sm whitespace-pre-wrap text-white/90">
          {message.text}
        </p>
      )}
    </div>,
    adminPortalTarget()
  );
}
