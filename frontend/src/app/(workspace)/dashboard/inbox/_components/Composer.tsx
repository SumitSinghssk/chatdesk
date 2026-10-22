"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, FileText, Loader2, Paperclip, Plus, SendHorizontal, X, Zap } from "lucide-react";

import { Button, Tooltip } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { INBOX_QK, inboxApi, type InboxMessage, type QuickReply } from "../../_lib/inboxApi";
import { EmojiPicker } from "./EmojiPicker";
import { fileKind } from "./fileKind";
import { fileSize } from "./format";
import { QuickRepliesModal } from "./QuickRepliesModal";

export const ACCEPT =
  "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";
export const MAX_FILES = 10;
const TYPING_EVERY_MS = 20_000;

/** True at most once every TYPING_EVERY_MS; `last` remembers when it last fired. */
function typingDue(last: { current: number }): boolean {
  const now = Date.now();
  if (now - last.current < TYPING_EVERY_MS) return false;
  last.current = now;
  return true;
}

function FilePreview({ file, url }: { file: File; url: string }) {
  if (file.type.startsWith("image/")) {
    return (
      <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain shadow-sm" />
    );
  }
  if (file.type.startsWith("video/")) {
    return <video src={url} controls className="max-h-full max-w-full rounded-lg shadow-sm" />;
  }
  const kind = fileKind(file.type, file.name);
  return (
    <div className="bg-surface flex w-72 max-w-full flex-col items-center gap-3 rounded-xl p-6 text-center shadow-sm">
      <span className={cn("flex h-16 w-14 items-center justify-center rounded-lg", kind.tone)}>
        <kind.icon className="h-8 w-8" />
      </span>
      <p className="text-fg w-full truncate text-sm font-medium">{file.name}</p>
      <p className="text-fg-subtle text-xs">
        {kind.label} · {fileSize(file.size)}
      </p>
    </div>
  );
}

function Thumb({
  file,
  url,
  active,
  onClick,
  onRemove,
}: {
  file: File;
  url: string;
  active: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const kind = fileKind(file.type, file.name);
  return (
    <div
      className={cn(
        "group/thumb relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2",
        active ? "border-primary" : "border-transparent"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="block h-full w-full"
        aria-label={`Preview ${file.name}`}
      >
        {file.type.startsWith("image/") ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={cn("flex h-full w-full items-center justify-center", kind.tone)}>
            <kind.icon className="h-6 w-6" />
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover/thumb:opacity-100 focus-visible:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function Composer({
  windowOpen,
  blocked,
  sending,
  replyTo,
  files,
  onFilesChange,
  onCancelReply,
  onSendText,
  onSendFiles,
  onOpenTemplates,
  onTyping,
}: {
  windowOpen: boolean;
  blocked: boolean;
  sending: boolean;
  replyTo: InboxMessage | null;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onCancelReply: () => void;
  onSendText: (text: string) => Promise<boolean>;
  onSendFiles: (files: File[], caption: string) => Promise<boolean>;
  onOpenTemplates: () => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [manageOpen, setManageOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  const quick = useQuery({
    queryKey: INBOX_QK.QUICK_REPLIES,
    queryFn: async () => (await inboxApi.quickReplies()).data,
    staleTime: 60_000,
  });

  // Local previews of picked files; revoked when the files change or the composer unmounts
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const shown = Math.min(active, Math.max(files.length - 1, 0));

  const slash = text.startsWith("/") && !text.includes("\n") ? text.slice(1).toLowerCase() : null;
  const suggestions: QuickReply[] =
    slash === null
      ? []
      : (quick.data ?? [])
          .filter((q) => q.shortcut.startsWith(slash) || q.text.toLowerCase().includes(slash))
          .slice(0, 6);
  const pick = Math.min(cursor, Math.max(suggestions.length - 1, 0));

  const resize = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const change = (value: string) => {
    setText(value);
    setCursor(0);
    requestAnimationFrame(resize);
    if (value.trim() && typingDue(lastTyping)) onTyping();
  };

  const insertAtCursor = (value: string) => {
    const el = areaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + value + text.slice(end);
    change(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const applyQuick = (q: QuickReply) => {
    change(q.text);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const submit = async () => {
    if (sending) return;
    const body = text.trim();
    const ok = files.length ? await onSendFiles(files, body) : body ? await onSendText(body) : false;
    if (ok) {
      setText("");
      onFilesChange([]);
      setActive(0);
      requestAnimationFrame(resize);
      areaRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) =>
          e.key === "ArrowDown"
            ? (c + 1) % suggestions.length
            : (c - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyQuick(suggestions[pick]!);
        return;
      }
      if (e.key === "Escape") {
        change("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const addPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length) onFilesChange([...files, ...picked].slice(0, MAX_FILES));
    areaRef.current?.focus();
  };

  if (blocked) {
    return (
      <div className="border-line bg-surface text-fg-subtle flex items-center justify-center gap-2 border-t px-4 py-4 text-sm">
        <Ban className="h-4 w-4" /> You blocked this contact. Unblock them in the contact panel to reply.
      </div>
    );
  }

  if (!windowOpen) {
    return (
      <div className="border-line bg-surface flex flex-col items-center gap-2 border-t px-4 py-3 text-center sm:flex-row sm:text-left">
        <p className="text-fg-subtle flex-1 text-[13px]">
          <span className="text-fg font-semibold">The 24-hour reply window is closed.</span> WhatsApp only
          allows approved template messages until the customer writes again.
        </p>
        <Button leftIcon={FileText} onClick={onOpenTemplates}>
          Send template
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      {files.length > 0 && (
        <div className="border-line bg-page absolute inset-x-0 bottom-full z-20 flex h-[min(26rem,60vh)] flex-col border-t shadow-lg">
          <div className="flex items-center gap-2 px-4 py-2">
            <p className="text-fg min-w-0 flex-1 truncate text-sm font-medium">
              {files[shown]?.name}{" "}
              <span className="text-fg-subtle text-xs">({fileSize(files[shown]?.size ?? 0)})</span>
            </p>
            <Button
              iconOnly
              variant="ghost"
              size="sm"
              leftIcon={X}
              aria-label="Discard files"
              onClick={() => onFilesChange([])}
            />
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {files[shown] && <FilePreview file={files[shown]!} url={urls[shown]!} />}
          </div>
          <div className="flex items-center justify-center gap-2 overflow-x-auto px-4 pb-3">
            {files.map((f, i) => (
              <Thumb
                key={`${f.name}-${i}`}
                file={f}
                url={urls[i]!}
                active={i === shown}
                onClick={() => setActive(i)}
                onRemove={() => onFilesChange(files.filter((_, j) => j !== i))}
              />
            ))}
            {files.length < MAX_FILES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add more files"
                className="border-line-strong text-fg-subtle hover:text-fg flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Quick replies"
          className="border-line bg-surface absolute inset-x-3 bottom-full z-30 mb-2 overflow-hidden rounded-xl border shadow-xl"
        >
          {suggestions.map((q, i) => (
            <li key={q.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === pick}
                onMouseEnter={() => setCursor(i)}
                onClick={() => applyQuick(q)}
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-2 text-left",
                  i === pick && "bg-primary-soft"
                )}
              >
                <span className="text-primary shrink-0 font-mono text-xs font-semibold">/{q.shortcut}</span>
                <span className="text-fg-muted line-clamp-2 text-xs">{q.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-line bg-surface border-t">
        {replyTo && (
          <div className="border-line flex items-center gap-2 border-b px-4 py-2">
            <div className="border-primary min-w-0 flex-1 border-l-4 pl-2">
              <p className="text-primary text-xs font-semibold">
                Replying to {replyTo.direction === "out" ? "yourself" : "customer"}
              </p>
              <p className="text-fg-subtle truncate text-xs">{replyTo.text ?? `[${replyTo.type}]`}</p>
            </div>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={onCancelReply}
              className="text-fg-faint hover:text-fg p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1 p-2 sm:p-3">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={addPicked} />
          <EmojiPicker onPick={insertAtCursor} />
          <Tooltip label="Attach files" side="top" align="start">
            <Button
              iconOnly
              variant="ghost"
              leftIcon={Paperclip}
              aria-label="Attach files"
              onClick={() => fileRef.current?.click()}
            />
          </Tooltip>
          <Tooltip label="Quick replies (type /)" side="top" align="start">
            <Button
              iconOnly
              variant="ghost"
              leftIcon={Zap}
              aria-label="Quick replies"
              onClick={() => setManageOpen(true)}
            />
          </Tooltip>
          <Tooltip label="Send a template" side="top" align="start">
            <Button
              iconOnly
              variant="ghost"
              leftIcon={FileText}
              aria-label="Send a template"
              onClick={onOpenTemplates}
            />
          </Tooltip>
          <textarea
            ref={areaRef}
            rows={1}
            value={text}
            onChange={(e) => change(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={files.length ? "Add a caption" : "Type a message, or / for quick replies"}
            aria-label="Message"
            maxLength={4096}
            className="border-line-strong bg-page text-fg placeholder:text-fg-faint focus:border-primary focus:ring-primary/15 max-h-40 min-h-9 flex-1 resize-none rounded-lg border px-3 py-2 text-sm leading-5 focus:ring-3 focus:outline-none"
          />
          <Tooltip
            label={files.length > 1 ? `Send ${files.length} files` : "Send (Enter)"}
            side="top"
            align="end"
          >
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending || (!text.trim() && !files.length)}
              aria-label="Send"
              className="bg-primary text-primary-fg hover:bg-primary-hover relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
              {files.length > 1 && !sending && (
                <span className="bg-surface text-primary absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow">
                  {files.length}
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
      <QuickRepliesModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
