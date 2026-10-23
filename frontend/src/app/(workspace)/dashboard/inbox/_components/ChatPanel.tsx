"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  PanelRight,
  RotateCcw,
  TimerOff,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, Button, Dropdown, Spinner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import {
  INBOX_QK,
  inboxApi,
  type Conversation,
  type ConversationEvent,
  type ConversationStatus,
  type InboxMessage,
  type SendTemplateInput,
} from "../../_lib/inboxApi";
import { Composer, MAX_FILES } from "./Composer";
import { fileKind, mediaType } from "./fileKind";
import { bubbleTime, dayLabel, sameDay, windowLeft } from "./format";
import { MediaViewer } from "./MediaViewer";
import { MessageBubble } from "./MessageBubble";
import { AssignMenu } from "./AssignMenu";
import { BotBanner, StartBotMenu } from "./BotControls";
import { TemplateModal } from "./TemplateModal";
import { Tooltip } from "../../_components/Tooltip";

const LATEST = 50;
const POLL_MS = 4000;

function mergeById(...lists: InboxMessage[][]): InboxMessage[] {
  const map = new Map<number, InboxMessage>();
  for (const list of lists) for (const m of list) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

/** Media that opens in the full-screen viewer (photos, videos, PDFs). */
function viewable(m: InboxMessage) {
  if (!m.media) return false;
  const type = mediaType(m);
  if (type === "image" || type === "video" || type === "sticker") return true;
  return type === "document" && fileKind(m.media.mime, m.media.filename).label === "PDF";
}

/** Compare times as numbers, not text: "12:00:05.3Z" sorts before "12:00:05Z" as a string. */
const at = (iso: string) => new Date(iso).getTime();

function EventChip({ event }: { event: ConversationEvent }) {
  return (
    <div className="flex justify-center px-4 py-1" role="note">
      <span className="bg-surface/90 text-fg-subtle max-w-full truncate rounded-md px-2.5 py-1 text-[11px] shadow-xs">
        {event.kind === "bot" && (
          <Bot className="text-primary mr-1 inline h-3.5 w-3.5 align-[-3px]" aria-hidden />
        )}
        <span className="text-fg font-medium">{event.text}</span>
        {event.actor && event.kind !== "bot" ? ` by ${event.actor}` : ""} · {bubbleTime(event.created_at)}
      </span>
    </div>
  );
}

function WindowChip({ conversation, nowMs }: { conversation: Conversation; nowMs: number }) {
  const left = windowLeft(conversation.window_expires_at, nowMs);
  return (
    <Tooltip
      label={
        left ? "Free-form replies are allowed until the 24-hour window closes" : "Only templates can be sent"
      }
      align="end"
    >
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold",
          left ? "bg-success-soft text-success" : "bg-hover text-fg-subtle"
        )}
      >
        {left ? <Clock3 className="h-3 w-3" /> : <TimerOff className="h-3 w-3" />}
        {left ? `${left} left` : "Window closed"}
      </span>
    </Tooltip>
  );
}

export function ChatPanel({
  conversation,
  onBack,
  onChanged,
  contactOpen,
  onToggleContact,
  autoTemplate,
  onTemplateShown,
}: {
  conversation: Conversation;
  onBack: () => void;
  onChanged: (c: Conversation) => void;
  contactOpen: boolean;
  onToggleContact: () => void;
  autoTemplate: boolean;
  onTemplateShown: () => void;
}) {
  const queryClient = useQueryClient();
  const id = conversation.id;
  const contact = conversation.contact;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const dragDepth = useRef(0);
  const [older, setOlder] = useState<{ id: number; items: InboxMessage[]; hasMore: boolean | null }>({
    id,
    items: [],
    hasMore: null,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [templateOpen, setTemplateOpen] = useState(autoTemplate);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seenId, setSeenId] = useState(0);
  // the "N unread messages" divider stays where it was when the chat was opened
  const [unreadAtOpen] = useState(conversation.unread_count);

  // older pages belong to one conversation; switching resets them (derived, no effect needed)
  const olderItems = useMemo(() => (older.id === id ? older.items : []), [older, id]);

  const latest = useQuery({
    queryKey: INBOX_QK.MESSAGES(id),
    queryFn: () => inboxApi.messages(id, { limit: LATEST }),
    refetchInterval: POLL_MS,
  });

  useEffect(() => {
    if (autoTemplate) onTemplateShown();
  }, [autoTemplate, onTemplateShown]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // keep the list item (unread count, window) in sync with what the message poll returns
  const fresh = latest.data?.conversation;
  useEffect(() => {
    if (fresh) onChanged(fresh);
  }, [fresh, onChanged]);

  const unread = conversation.unread_count;
  useEffect(() => {
    if (!unread) return;
    inboxApi
      .markRead(id)
      .then((res) => {
        onChanged(res.data);
        void queryClient.invalidateQueries({ queryKey: INBOX_QK.SUMMARY });
      })
      .catch(() => null);
  }, [id, unread, onChanged, queryClient]);

  const hasMore =
    older.id === id && older.hasMore !== null ? older.hasMore : (latest.data?.meta.has_more ?? false);
  const all = useMemo(() => mergeById(olderItems, latest.data?.data ?? []), [olderItems, latest.data]);
  const reactions = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of all) {
      if (m.type === "reaction" && m.reaction_to && m.text) {
        map.set(m.reaction_to, [...(map.get(m.reaction_to) ?? []), m.text]);
      }
    }
    return map;
  }, [all]);
  const visible = useMemo(() => all.filter((m) => m.type !== "reaction"), [all]);
  const media = useMemo(() => visible.filter(viewable), [visible]);
  // assignment and status changes, placed between the messages by time
  const events = useMemo(() => {
    const list = latest.data?.events ?? [];
    const first = visible[0]?.created_at;
    return hasMore && first ? list.filter((e) => at(e.created_at) >= at(first)) : list;
  }, [latest.data, visible, hasMore]);
  const eventsBefore = (m: InboxMessage, prev: InboxMessage | undefined) =>
    events.filter(
      (e) => at(e.created_at) <= at(m.created_at) && (!prev || at(e.created_at) > at(prev.created_at))
    );
  const eventsAfterLast = events.filter(
    (e) => !visible.length || at(e.created_at) > at(visible[visible.length - 1]!.created_at)
  );
  const lastId = visible.at(-1)?.id;

  // first of the messages that were unread when the chat opened
  const unreadStartId = useMemo(() => {
    if (!unreadAtOpen) return null;
    const inbound = visible.filter((m) => m.direction === "in");
    return inbound.at(-Math.min(unreadAtOpen, inbound.length))?.id ?? null;
  }, [unreadAtOpen, visible]);

  const newBelow = atBottom ? 0 : visible.filter((m) => m.id > seenId && m.direction === "in").length;

  // stay pinned to the newest message unless the user scrolled up to read history
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId, id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottom.current = bottom;
    if (bottom !== atBottom) {
      setAtBottom(bottom);
      if (!bottom) setSeenId(lastId ?? 0);
    }
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const loadOlder = async () => {
    const first = all[0];
    if (!first) return;
    const el = scrollRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    setLoadingOlder(true);
    try {
      const res = await inboxApi.messages(id, { before: first.id, limit: LATEST });
      setOlder({ id, items: mergeById(res.data, olderItems), hasMore: res.meta.has_more });
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  };

  const afterSend = (message: InboxMessage, note?: string) => {
    stickToBottom.current = true;
    queryClient.setQueryData(INBOX_QK.MESSAGES(id), (prev: typeof latest.data) =>
      prev ? { ...prev, data: mergeById(prev.data, [message]) } : prev
    );
    void queryClient.invalidateQueries({ queryKey: INBOX_QK.MESSAGES(id) });
    void queryClient.invalidateQueries({ queryKey: ["inbox", "list"] });
    if (message.status === "failed") toast.error(note ?? "WhatsApp didn't accept the message");
  };

  const run = async (task: () => Promise<{ message?: string; data: InboxMessage }>) => {
    setSending(true);
    try {
      const res = await task();
      afterSend(res.data, res.message);
      setReplyTo(null);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  };

  /** Sends picked files one by one (like WhatsApp); the caption goes with the first. */
  const sendFiles = async (picked: File[], caption: string) => {
    setSending(true);
    try {
      for (const [i, file] of picked.entries()) {
        const res = await inboxApi.sendMedia(id, file, i === 0 ? caption : undefined);
        afterSend(res.data, res.message);
      }
      setReplyTo(null);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  };

  const retry = async (m: InboxMessage) => {
    setRetryingId(m.id);
    try {
      const res = await inboxApi.retry(m.id);
      afterSend(res.data, res.message);
      if (res.data.status !== "failed") toast.success("Message sent");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRetryingId(null);
    }
  };

  const sendTemplate = (input: SendTemplateInput) => run(() => inboxApi.sendTemplate(id, input));

  const setStatus = async (status: ConversationStatus) => {
    try {
      const res = await inboxApi.setStatus(id, status);
      onChanged(res.data);
      toast.success(res.message ?? "Updated");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // Drag & drop and paste: only while free-form replies are allowed
  const canAttach = conversation.window_open && !contact.blocked;
  const addFiles = (incoming: File[]) => {
    if (!canAttach || !incoming.length) return;
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  };
  const onDragEnter = (e: DragEvent) => {
    if (!canAttach || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length && canAttach) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={(e) => canAttach && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <header className="border-line bg-surface flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
        <Button
          iconOnly
          variant="ghost"
          size="sm"
          leftIcon={ArrowLeft}
          aria-label="Back to chats"
          className="shrink-0 lg:hidden"
          onClick={onBack}
        />
        <button
          type="button"
          onClick={onToggleContact}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <Avatar name={contact.display_name} size={36} />
          <span className="min-w-0">
            <span className="text-fg block truncate text-sm font-semibold">{contact.display_name}</span>
            <span className="text-fg-subtle block truncate text-xs">{contact.phone}</span>
          </span>
        </button>
        <div className="hidden sm:block">
          <WindowChip conversation={conversation} nowMs={nowMs} />
        </div>
        {!conversation.bot && (
          <div className="hidden sm:block">
            <StartBotMenu conversation={conversation} />
          </div>
        )}
        <AssignMenu conversation={conversation} onChanged={onChanged} />
        {conversation.status === "resolved" ? (
          <Button size="sm" variant="secondary" leftIcon={RotateCcw} onClick={() => setStatus("open")}>
            <span className="hidden sm:inline">Reopen</span>
          </Button>
        ) : (
          <div className="flex items-center">
            <Button
              size="sm"
              leftIcon={CheckCircle2}
              onClick={() => setStatus("resolved")}
              className="rounded-r-none"
            >
              <span className="hidden sm:inline">Resolve</span>
            </Button>
            <Dropdown
              width="w-52"
              trigger={() => (
                <button
                  type="button"
                  aria-label="More status options"
                  className="bg-primary text-primary-fg hover:bg-primary-hover flex h-8 items-center rounded-r-lg border-l border-white/25 px-1.5"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
              items={[
                conversation.status === "pending"
                  ? { label: "Reopen chat", icon: RotateCcw, onClick: () => setStatus("open") }
                  : { label: "Mark as pending", icon: Clock3, onClick: () => setStatus("pending") },
              ]}
            />
          </div>
        )}
        <Tooltip label={contactOpen ? "Hide contact" : "Show contact"} align="end">
          <Button
            iconOnly
            variant={contactOpen ? "secondary" : "ghost"}
            size="sm"
            leftIcon={PanelRight}
            aria-label="Toggle contact panel"
            aria-pressed={contactOpen}
            onClick={onToggleContact}
          />
        </Tooltip>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto bg-[#efeae2] py-3 dark:bg-[#0b141a]"
          aria-live="polite"
          aria-label={`Messages with ${contact.display_name}`}
        >
          {latest.isLoading ? (
            <Spinner className="h-full" />
          ) : (
            <div className="space-y-1.5">
              {hasMore && (
                <div className="flex justify-center pb-2">
                  <Button size="xs" variant="secondary" loading={loadingOlder} onClick={loadOlder}>
                    Load earlier messages
                  </Button>
                </div>
              )}
              {!visible.length && (
                <p className="bg-surface/80 text-fg-subtle mx-auto mt-6 max-w-sm rounded-lg px-4 py-3 text-center text-xs shadow-xs">
                  No messages yet. Send an approved template to start the conversation.
                </p>
              )}
              {visible.map((m, i) => (
                <Fragment key={m.id}>
                  {eventsBefore(m, visible[i - 1]).map((e) => (
                    <EventChip key={`e${e.id}`} event={e} />
                  ))}
                  {(i === 0 || !sameDay(visible[i - 1]!.created_at, m.created_at)) && (
                    <div className="flex justify-center py-1.5">
                      <span className="bg-surface/90 text-fg-subtle rounded-md px-2.5 py-1 text-[11px] font-medium shadow-xs">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  {m.id === unreadStartId && (
                    <div className="flex justify-center py-1.5" role="separator">
                      <span className="bg-surface/90 text-primary rounded-full px-3 py-1 text-[11px] font-semibold shadow-xs">
                        {unreadAtOpen} unread message{unreadAtOpen === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                  <div className={cn(reactions.has(m.wamid ?? "") && "pb-3")}>
                    <MessageBubble
                      message={m}
                      reactions={reactions.get(m.wamid ?? "") ?? []}
                      onReply={setReplyTo}
                      onOpenMedia={(msg) => setViewer(media.findIndex((x) => x.id === msg.id))}
                      onRetry={retry}
                      retrying={retryingId === m.id}
                    />
                  </div>
                </Fragment>
              ))}
              {eventsAfterLast.map((e) => (
                <EventChip key={`e${e.id}`} event={e} />
              ))}
            </div>
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label={newBelow ? `${newBelow} new messages, jump to latest` : "Jump to latest message"}
            className="bg-surface text-fg-subtle hover:text-fg absolute right-4 bottom-4 z-10 flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
          >
            <ChevronDown className="h-5 w-5" />
            {newBelow > 0 && (
              <span className="bg-primary text-primary-fg absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                {newBelow}
              </span>
            )}
          </button>
        )}

        {dragging && (
          <div className="border-primary bg-primary-soft/90 pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed">
            <Upload className="text-primary h-8 w-8" />
            <p className="text-primary text-sm font-semibold">Drop files to send to {contact.display_name}</p>
          </div>
        )}
      </div>

      <BotBanner conversation={{ ...conversation, ...(fresh ?? {}) }} />
      <Composer
        windowOpen={conversation.window_open}
        blocked={contact.blocked}
        sending={sending}
        replyTo={replyTo}
        files={files}
        onFilesChange={setFiles}
        onCancelReply={() => setReplyTo(null)}
        onSendText={(text) => run(() => inboxApi.sendText(id, text, replyTo?.id))}
        onSendFiles={sendFiles}
        onOpenTemplates={() => setTemplateOpen(true)}
        onTyping={() => void inboxApi.typing(id).catch(() => null)}
      />

      <TemplateModal
        open={templateOpen}
        contactName={contact.display_name}
        onClose={() => setTemplateOpen(false)}
        onSend={sendTemplate}
      />

      {viewer !== null && viewer >= 0 && (
        <MediaViewer
          items={media}
          index={Math.min(viewer, media.length - 1)}
          contactName={contact.display_name}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
