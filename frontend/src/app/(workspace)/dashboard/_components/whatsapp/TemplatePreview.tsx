"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Copy,
  ExternalLink,
  ImageIcon,
  List,
  MapPin,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Play,
  Reply,
  Smile,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { fillVariables, WaText } from "./WaText";

export interface PreviewTemplate {
  header: { format: string; text: string | null; example?: string | null };
  body: string;
  footer: string | null;
  buttons: { type: string; text: string }[];
}

export interface PreviewMedia {
  url: string | null;
  mime?: string | null;
  filename?: string | null;
}

const BUTTON_ICONS: Record<string, LucideIcon> = {
  quick_reply: Reply,
  url: ExternalLink,
  phone_number: Phone,
  copy_code: Copy,
  otp: Copy,
  list: List, // the "open list" button of a list message
};

function buttonLabel(b: { type: string; text: string }) {
  if (b.type === "copy_code") return b.text || "Copy offer code";
  return b.text || "Button";
}

function MediaHeader({ format, media }: { format: string; media?: PreviewMedia | null }) {
  const url = media?.url;
  if (format === "image") {
    return url ? (
      <img src={url} alt="" className="aspect-[1.91/1] w-full rounded-md object-cover" />
    ) : (
      <Placeholder icon={ImageIcon} label="Image" />
    );
  }
  if (format === "video") {
    return (
      <div className="relative">
        {url ? (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            className="aspect-[1.91/1] w-full rounded-md bg-black object-cover"
          />
        ) : (
          <Placeholder icon={Video} label="Video" />
        )}
        <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white">
          <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
        </span>
      </div>
    );
  }
  if (format === "document") {
    return (
      <div className="flex items-center gap-2.5 rounded-md bg-black/5 px-2.5 py-2.5 dark:bg-white/10">
        <span className="flex h-9 w-8 shrink-0 items-center justify-center rounded bg-red-500 text-[9px] font-bold text-white">
          PDF
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{media?.filename || "Document.pdf"}</span>
          <span className="block text-[11px] opacity-60">PDF document</span>
        </span>
      </div>
    );
  }
  if (format === "location") {
    return (
      <div className="relative flex aspect-[1.91/1] w-full items-center justify-center overflow-hidden rounded-md bg-[#dfe7d6] dark:bg-[#26352e]">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff99 2px, transparent 2px), linear-gradient(90deg, #ffffff99 2px, transparent 2px)",
            backgroundSize: "28px 28px",
          }}
        />
        <MapPin className="relative h-8 w-8 fill-red-500 text-red-700" aria-hidden />
      </div>
    );
  }
  return null;
}

function Placeholder({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500 dark:from-slate-700 dark:to-slate-800 dark:text-slate-400">
      <Icon className="h-8 w-8" aria-hidden />
      <span className="text-[11px] font-medium">{label}</span>
    </div>
  );
}

function ButtonRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 border-t border-black/[0.08] px-2 py-2 text-[13.5px] font-medium text-[#027eb5] dark:border-white/10 dark:text-[#53bdeb]",
        !onClick && "cursor-default"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** One template message exactly as the customer sees it in WhatsApp. */
export function TemplateBubble({
  template,
  values,
  media,
  time = "10:24",
  highlight = true,
}: {
  template: PreviewTemplate;
  /** Variable values; anything missing falls back to the {{name}} itself (highlighted). */
  values?: { header?: Record<string, string>; body?: Record<string, string> };
  media?: PreviewMedia | null;
  time?: string;
  highlight?: boolean;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const fmt = template.header.format;
  const variable = (name: string): ReactNode =>
    highlight ? (
      <span className="rounded bg-amber-200/70 px-0.5 font-mono text-[0.9em] text-amber-900 dark:bg-amber-400/25 dark:text-amber-200">
        {`{{${name}}}`}
      </span>
    ) : (
      `{{${name}}}`
    );
  const headerText = template.header.text ? fillVariables(template.header.text, values?.header ?? {}) : null;
  const body = fillVariables(template.body || "", values?.body ?? {});
  const buttons = template.buttons.filter((b) => b.type !== "other" || b.text);
  const collapsed = buttons.length > 3;
  const shown = collapsed ? buttons.slice(0, 2) : buttons;

  return (
    // the "All options" sheet is placed against the chat area (the nearest positioned parent)
    <div className="w-full max-w-[290px]">
      <div className="relative">
        <svg
          viewBox="0 0 8 13"
          width="8"
          height="13"
          className="absolute top-0 -left-2 text-white dark:text-[#202c33]"
          aria-hidden
        >
          <path fill="currentColor" d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z" />
        </svg>
        <div className="overflow-hidden rounded-lg rounded-tl-none bg-white text-[13.5px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] dark:bg-[#202c33] dark:text-[#e9edef]">
          <div className="px-2 pt-1.5 pb-1">
            {fmt !== "none" && fmt !== "text" && (
              <div className="-mx-1 mb-1.5">
                <MediaHeader format={fmt} media={media} />
              </div>
            )}
            {fmt === "text" && headerText && (
              <p className="mb-1 font-bold break-words">
                <WaText text={headerText} variable={variable} />
              </p>
            )}
            <p className="break-words whitespace-pre-wrap">
              {body ? (
                <WaText text={body} variable={variable} />
              ) : (
                <span className="opacity-40">Message body</span>
              )}
            </p>
            {template.footer && (
              <p className="mt-1 text-[12px] text-[#667781] dark:text-[#8696a0]">{template.footer}</p>
            )}
            <p className="-mt-0.5 text-right text-[11px] text-[#667781] dark:text-[#8696a0]">{time}</p>
          </div>
          {shown.map((b, i) => (
            <ButtonRow key={i} icon={BUTTON_ICONS[b.type] ?? ExternalLink} label={buttonLabel(b)} />
          ))}
          {collapsed && <ButtonRow icon={List} label="See all options" onClick={() => setAllOpen(true)} />}
        </div>
      </div>
      {allOpen && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={() => setAllOpen(false)}>
          <div
            className="w-full overflow-hidden rounded-t-2xl bg-white pb-2 text-[#111b21] shadow-lg dark:bg-[#233138] dark:text-[#e9edef]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2.5 text-[13px] font-semibold">
              All options
              <button
                type="button"
                onClick={() => setAllOpen(false)}
                aria-label="Close options"
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {buttons.map((b, i) => (
              <ButtonRow key={i} icon={BUTTON_ICONS[b.type] ?? ExternalLink} label={buttonLabel(b)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CHAT_BG =
  "bg-[#efeae2] dark:bg-[#0b141a] [background-image:radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] dark:[background-image:radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:14px_14px]";

/** Just the chat wallpaper around the bubble (for dialogs). */
export function ChatBackdrop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg p-4 pl-5", CHAT_BG, className)}>{children}</div>
  );
}

/** A phone running WhatsApp, showing the template as the customer receives it. */
export function PhonePreview({
  businessName,
  children,
  overlay,
  scrollChat,
}: {
  businessName: string;
  children: ReactNode;
  /** keep the phone's height and scroll the chat instead (for previews that add messages) */
  scrollChat?: boolean;
  /** a full screen drawn over the chat (e.g. a product page the customer opened) */
  overlay?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.2rem] bg-slate-900 p-[7px] shadow-xl ring-1 ring-black/10 dark:bg-black dark:ring-white/10">
      <div className="overflow-hidden rounded-[1.8rem] bg-white dark:bg-[#0b141a]">
        <div className="flex items-center justify-between bg-[#008069] px-5 pt-2 pb-0.5 text-[10px] font-semibold text-white dark:bg-[#202c33]">
          <span>9:41</span>
          <span className="flex items-center gap-1" aria-hidden>
            <span className="flex items-end gap-px">
              {[3, 5, 7, 9].map((h) => (
                <span key={h} className="w-[2px] rounded-sm bg-white" style={{ height: h }} />
              ))}
            </span>
            <span className="ml-1 h-[9px] w-[18px] rounded-[3px] border border-white/80 p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-white" />
            </span>
          </span>
        </div>
        <div className="relative">
          {overlay && <div className="absolute inset-0 z-20 flex flex-col">{overlay}</div>}
          <div className="flex items-center gap-2 bg-[#008069] px-2 py-2 text-white dark:bg-[#202c33]">
            <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-semibold">
              {(businessName.trim()[0] ?? "B").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-1 text-[14px] font-semibold">
                <span className="truncate">{businessName || "Your business"}</span>
                <BadgeCheck
                  className="h-4 w-4 shrink-0 fill-[#25d366] text-[#008069] dark:text-[#202c33]"
                  aria-hidden
                />
              </span>
              <span className="block truncate text-[11px] opacity-80">Business account</span>
            </span>
            <Video className="h-5 w-5 shrink-0" aria-hidden />
            <Phone className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <MoreVertical className="h-5 w-5 shrink-0" aria-hidden />
          </div>
          <div
            data-phone-chat
            className={cn(
              "relative flex min-h-[440px] flex-col gap-2 px-3 py-3 pl-5",
              scrollChat && "h-[480px] overflow-y-auto overscroll-contain [&>*]:shrink-0",
              CHAT_BG
            )}
          >
            <span className="mx-auto rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-[#54656f] shadow-xs dark:bg-[#182229] dark:text-[#8696a0]">
              TODAY
            </span>
            <span className="mx-auto max-w-[85%] rounded-md bg-[#ffeecd] px-2.5 py-1 text-center text-[10.5px] leading-snug text-[#54656f] dark:bg-[#182229] dark:text-[#ffd279]">
              This business uses a secure service from Meta to manage this chat.
            </span>
            {children}
          </div>
          <div className="flex items-center gap-1.5 bg-[#f0f2f5] px-2 py-2 dark:bg-[#202c33]">
            <span className="flex h-9 flex-1 items-center gap-2 rounded-full bg-white px-3 text-[13px] text-[#8696a0] dark:bg-[#2a3942]">
              <Smile className="h-5 w-5" aria-hidden />
              <span className="flex-1">Message</span>
              <Paperclip className="h-[18px] w-[18px]" aria-hidden />
              <Camera className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#008069] text-white dark:bg-[#00a884]">
              <Mic className="h-[18px] w-[18px]" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
