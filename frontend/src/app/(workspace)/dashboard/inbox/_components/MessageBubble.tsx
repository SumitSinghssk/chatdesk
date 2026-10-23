"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  List,
  MapPin,
  Mic,
  Phone,
  Play,
  Reply,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { downloadUrl, mediaUrl, type InboxMessage } from "../../_lib/inboxApi";
import { fileKind, mediaType } from "./fileKind";
import { bubbleTime, fileSize } from "./format";
import { Tooltip } from "../../_components/Tooltip";

const TEMPLATE_BUTTON_ICONS: Record<string, typeof Reply> = {
  quick_reply: Reply,
  url: ExternalLink,
  phone_number: Phone,
  copy_code: Copy,
  otp: Copy,
  list: List, // an automatic reply's list menu
};

function fullTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
}

/** Delivery ticks, with WhatsApp's "message info" (sent / delivered / read times) on hover. */
function Ticks({ message }: { message: InboxMessage }) {
  if (message.direction !== "out") return null;
  const map = {
    pending: { icon: Clock, cls: "", label: "Sending" },
    sent: { icon: Check, cls: "", label: "Sent" },
    received: { icon: Check, cls: "", label: "Sent" },
    delivered: { icon: CheckCheck, cls: "", label: "Delivered" },
    read: { icon: CheckCheck, cls: "text-sky-500 opacity-100", label: "Read" },
    failed: { icon: AlertCircle, cls: "text-danger opacity-100", label: "Not delivered" },
  } as const;
  const { icon: Icon, cls, label } = map[message.status];
  const info = [
    fullTime(message.sent_at) && `Sent: ${fullTime(message.sent_at)}`,
    fullTime(message.delivered_at) && `Delivered: ${fullTime(message.delivered_at)}`,
    fullTime(message.read_at) && `Read: ${fullTime(message.read_at)}`,
  ].filter((l): l is string => !!l);
  return (
    <Tooltip
      label={
        info.length ? (
          <span className="block text-left">
            {info.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </span>
        ) : (
          label
        )
      }
      side="top"
      align="end"
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", cls)} aria-label={label} />
    </Tooltip>
  );
}

function ImageMedia({ message, onOpen }: { message: InboxMessage; onOpen: () => void }) {
  const media = message.media!;
  const [failed, setFailed] = useState(false);
  const sticker = message.type === "sticker";
  if (failed) {
    return (
      <div className="flex h-32 w-56 items-center justify-center rounded-lg bg-black/5 text-xs opacity-70 dark:bg-white/10">
        Photo unavailable
      </div>
    );
  }
  return (
    <div className="group/media relative">
      <button
        type="button"
        onClick={onOpen}
        className="block overflow-hidden rounded-lg"
        aria-label="Open photo"
      >
        <img
          src={mediaUrl(media.path)}
          alt={message.text ?? (sticker ? "Sticker" : "Photo")}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            "block h-auto w-auto",
            sticker
              ? "max-h-36 max-w-36"
              : "max-h-[22rem] max-w-[min(20rem,70vw)] min-w-32 bg-black/5 object-cover"
          )}
        />
      </button>
      {!sticker && (
        <a
          href={downloadUrl(media.path)}
          download={media.filename ?? true}
          aria-label="Download photo"
          className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover/media:opacity-100 focus-visible:opacity-100"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function VideoMedia({ message, onOpen }: { message: InboxMessage; onOpen: () => void }) {
  const media = message.media!;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block overflow-hidden rounded-lg bg-black"
      aria-label="Play video"
    >
      <video
        src={`${mediaUrl(media.path)}#t=0.1`}
        preload="metadata"
        muted
        className="block max-h-[22rem] max-w-[min(20rem,70vw)] min-w-40"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </span>
      {media.size ? (
        <span className="absolute bottom-1.5 left-2 text-[11px] font-medium text-white drop-shadow">
          {fileSize(media.size)}
        </span>
      ) : null}
    </button>
  );
}

function AudioMedia({ message }: { message: InboxMessage }) {
  const media = message.media!;
  return (
    <div className="flex items-center gap-2">
      <span className="bg-primary text-primary-fg flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <Mic className="h-4.5 w-4.5" />
      </span>
      <audio src={mediaUrl(media.path)} controls preload="none" className="h-9 w-56 max-w-[60vw]" />
    </div>
  );
}

function DocumentMedia({ message, onOpen }: { message: InboxMessage; onOpen: () => void }) {
  const media = message.media!;
  const kind = fileKind(media.mime, media.filename);
  const meta = [kind.label, media.size ? fileSize(media.size) : null].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className={cn("flex h-10 w-9 shrink-0 items-center justify-center rounded-md", kind.tone)}>
        <kind.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-medium">{media.filename ?? "Document"}</span>
        <span className="block text-[11px] opacity-70">{meta}</span>
      </span>
    </>
  );
  const inner =
    "flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10";
  return (
    <div className="flex w-[min(17rem,70vw)] items-center gap-1 rounded-lg bg-black/5 p-1.5 dark:bg-white/10">
      {kind.previewable ? (
        <button
          type="button"
          onClick={onOpen}
          className={inner}
          aria-label={`Open ${media.filename ?? "document"}`}
        >
          {body}
        </button>
      ) : (
        <a href={downloadUrl(media.path)} download={media.filename ?? true} className={inner}>
          {body}
        </a>
      )}
      <a
        href={downloadUrl(media.path)}
        download={media.filename ?? true}
        aria-label={`Download ${media.filename ?? "document"}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/20 opacity-70 transition hover:opacity-100"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}

export function MessageBubble({
  message,
  reactions,
  onReply,
  onOpenMedia,
  onRetry,
  retrying,
}: {
  message: InboxMessage;
  reactions: string[];
  onReply: (m: InboxMessage) => void;
  onOpenMedia: (m: InboxMessage) => void;
  onRetry: (m: InboxMessage) => void;
  retrying: boolean;
}) {
  const out = message.direction === "out";
  const type = mediaType(message);
  const visual = !!message.media && ["image", "sticker", "video"].includes(type);
  const showText = message.text && message.type !== "location";
  const copy = async () => {
    if (!message.text) return;
    await navigator.clipboard.writeText(message.text).catch(() => null);
    toast.success("Copied");
  };
  const open = () => onOpenMedia(message);

  return (
    <div className={cn("group/msg flex flex-col px-3 sm:px-6", out ? "items-end" : "items-start")}>
      <div
        className={cn("relative flex max-w-[85%] items-end gap-1 sm:max-w-[70%]", out && "flex-row-reverse")}
      >
        <div
          className={cn(
            "relative rounded-xl text-[13.5px] leading-relaxed shadow-xs",
            visual ? "p-1" : "px-2.5 py-1.5",
            out
              ? "rounded-tr-sm bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-white"
              : "bg-surface text-fg rounded-tl-sm",
            message.status === "failed" && "ring-danger/40 ring-1"
          )}
        >
          {message.type === "template" && (
            <p className="text-primary mb-0.5 text-[10.5px] font-semibold tracking-wide uppercase dark:text-emerald-300">
              Template · {message.template_name}
            </p>
          )}
          {message.reply_to && (
            <div className="border-primary mb-1 rounded-md border-l-4 bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              <p className="text-primary font-semibold dark:text-emerald-300">
                {message.reply_to.direction === "out" ? "You" : "Customer"}
              </p>
              <p className="line-clamp-2 opacity-80">
                {message.reply_to.text ?? `[${message.reply_to.type}]`}
              </p>
            </div>
          )}
          {message.media && (type === "image" || type === "sticker") && (
            <ImageMedia message={message} onOpen={open} />
          )}
          {message.media && type === "video" && <VideoMedia message={message} onOpen={open} />}
          {message.media && type === "audio" && <AudioMedia message={message} />}
          {message.media && type === "document" && <DocumentMedia message={message} onOpen={open} />}
          {message.location && (
            <a
              href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 flex items-start gap-2 rounded-lg bg-black/5 p-2 hover:bg-black/10 dark:bg-white/10"
            >
              <MapPin className="text-danger mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">{message.location.name ?? "Shared location"}</span>
                {message.location.address && (
                  <span className="block text-xs opacity-75">{message.location.address}</span>
                )}
                <span className="text-primary block text-xs font-medium dark:text-emerald-300">
                  Open in Google Maps
                </span>
              </span>
            </a>
          )}
          {showText && (
            <p className={cn("break-words whitespace-pre-wrap", visual && "px-1.5 pt-1")}>{message.text}</p>
          )}
          {message.type === "unsupported" && !message.text && (
            <p className="italic opacity-70">Unsupported message</p>
          )}
          <span
            className={cn(
              "float-right mt-1 ml-3 flex items-center gap-1 text-[10.5px] leading-none opacity-70",
              visual && "px-1.5 pb-0.5"
            )}
          >
            {out && message.sent_by && (
              <span className="hidden max-w-24 truncate sm:inline">{message.sent_by} ·</span>
            )}
            {bubbleTime(message.created_at)}
            <Ticks message={message} />
          </span>
          {!!message.template?.buttons.length && (
            <div className="clear-both -mx-2.5 mt-1 -mb-1.5">
              {message.template.buttons.map((b, i) => {
                const Icon = TEMPLATE_BUTTON_ICONS[b.type] ?? ExternalLink;
                return (
                  <span
                    key={i}
                    className="flex items-center justify-center gap-1.5 border-t border-black/[0.08] px-2 py-1.5 text-[13px] font-medium text-[#027eb5] dark:border-white/10 dark:text-[#53bdeb]"
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {b.type === "otp" || b.type === "copy_code" ? b.text || "Copy code" : b.text}
                  </span>
                );
              })}
            </div>
          )}
          {reactions.length > 0 && (
            <span
              className={cn(
                "border-line bg-surface absolute -bottom-3 rounded-full border px-1.5 text-xs shadow-xs",
                out ? "right-2" : "left-2"
              )}
            >
              {reactions.join(" ")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col opacity-0 transition group-hover/msg:opacity-100 focus-within:opacity-100">
          <Tooltip label="Reply">
            <button
              type="button"
              aria-label="Reply to this message"
              onClick={() => onReply(message)}
              className="text-fg-faint hover:bg-surface hover:text-fg rounded-full p-1"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          {message.text && (
            <Tooltip label="Copy">
              <button
                type="button"
                aria-label="Copy text"
                onClick={copy}
                className="text-fg-faint hover:bg-surface hover:text-fg rounded-full p-1"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      {message.status === "failed" && (
        <div className="mt-1 flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] sm:max-w-[70%]">
          <span className="text-danger">Not delivered{message.error ? `: ${message.error}` : ""}</span>
          {out && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              disabled={retrying}
              className="text-primary inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
            >
              <RotateCw className={cn("h-3 w-3", retrying && "animate-spin")} /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
