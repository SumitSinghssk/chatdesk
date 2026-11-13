"use client";

import {
  Fragment,
  useCallback,
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
  Sparkles,
  TimerOff,
  Upload,
  AlarmClock,
  AlarmClockOff,
  Pin,
  PinOff,
  Users,
  X,
  Search,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, Button, Dropdown, Spinner } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import {
  INBOX_QK,
  inboxApi,
  type ColleagueReply,
  type Conversation,
  type ConversationEvent,
  type ConversationStatus,
  type InboxMessage,
  type InboxNote,
  type Presence,
  type SendTemplateInput,
} from "../../_lib/inboxApi";
import { commerceApi } from "../../_lib/commerceApi";
import { useDashboard } from "../../_components/DashboardContext";
import { Composer, MAX_FILES, type ComposerMode } from "./Composer";
import { NoteBubble } from "./NoteBubble";
import { PresenceChip } from "./Presence";
import { SnoozeDialog } from "./SnoozeDialog";
import { fileKind, mediaType } from "./fileKind";
import { bubbleTime, dayLabel, sameDay, windowLeft } from "./format";
import { MediaViewer } from "./MediaViewer";
import { MessageBubble } from "./MessageBubble";
import { AssignMenu } from "./AssignMenu";
import { AiBanner } from "./AiControls";
import { BotBanner, StartBotMenu } from "./BotControls";
import { ProductModal, type SendProductsInput } from "./ProductModal";
import { TemplateModal } from "./TemplateModal";
import { Tooltip } from "../../_components/Tooltip";

const LATEST = 50;
const POLL_MS = 4000;
const BEAT_MS = 4000; // "I'm in this chat" heartbeat
const TYPING_FOR_MS = 6000; // a draft untouched this long counts as viewing, not typing

/** An event or a note, placed between the messages by time. */
type Marker =
  { kind: "event"; at: string; event: ConversationEvent } | { kind: "note"; at: string; note: InboxNote };

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
        {event.kind === "ai" && (
          <Sparkles className="text-primary mr-1 inline h-3.5 w-3.5 align-[-3px]" aria-hidden />
        )}
        <span className="text-fg font-medium">{event.text}</span>
        {event.actor && event.kind !== "bot" && event.actor !== "AI agent" ? ` by ${event.actor}` : ""} ·{" "}
        {bubbleTime(event.created_at)}
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
  jump,
  onJumped,
}: {
  conversation: Conversation;
  onBack: () => void;
  onChanged: (c: Conversation) => void;
  contactOpen: boolean;
  onToggleContact: () => void;
  autoTemplate: boolean;
  onTemplateShown: () => void;
  /** open at this message, with the search words marked (from a search result) */
  jump?: { messageId: number; words: string[] } | null;
  onJumped?: () => void;
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
  const [productsOpen, setProductsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [seenId, setSeenId] = useState(0);
  // the "N unread messages" divider stays where it was when the chat was opened
  const [unreadAtOpen] = useState(conversation.unread_count);
  const { me } = useDashboard();
  const readOnly = me.role === "viewer";
  // Collisions: who else is here, and a colleague's reply that came in while this person was typing
  const [mode, setMode] = useState<ComposerMode>("reply");
  const [others, setOthers] = useState<Presence[]>([]);
  const [conflict, setConflict] = useState<ColleagueReply | null>(null);
  const draft = useRef({ text: "", mode: "reply" as ComposerMode, editedAt: 0 });
  const lastBeat = useRef(0);
  // the newest message this person had seen when they started typing (sent with the reply)
  const seenWhenTyping = useRef<number | null>(null);

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
  // assignment and status changes, and internal notes, placed between the messages by time
  const markers = useMemo(() => {
    const list: Marker[] = [
      ...(latest.data?.events ?? []).map((e) => ({ kind: "event" as const, at: e.created_at, event: e })),
      ...(latest.data?.notes ?? []).map((n) => ({ kind: "note" as const, at: n.created_at, note: n })),
    ].sort((a, b) => at(a.at) - at(b.at));
    const first = visible[0]?.created_at;
    return hasMore && first ? list.filter((x) => at(x.at) >= at(first)) : list;
  }, [latest.data, visible, hasMore]);
  const markersBefore = (m: InboxMessage, prev: InboxMessage | undefined) =>
    markers.filter((x) => at(x.at) <= at(m.created_at) && (!prev || at(x.at) > at(prev.created_at)));
  const markersAfterLast = markers.filter(
    (x) => !visible.length || at(x.at) > at(visible[visible.length - 1]!.created_at)
  );
  const lastId = visible.at(-1)?.id;
  const refreshTimeline = () => {
    void queryClient.invalidateQueries({ queryKey: INBOX_QK.MESSAGES(id) });
    void queryClient.invalidateQueries({ queryKey: INBOX_QK.NOTES(id) });
  };
  const renderMarker = (x: Marker) =>
    x.kind === "event" ? (
      <EventChip key={`e${x.event.id}`} event={x.event} />
    ) : (
      <NoteBubble
        key={`n${x.note.id}-${x.note.edited_at ?? ""}`}
        conversationId={id}
        note={x.note}
        onChanged={refreshTimeline}
      />
    );

  // Presence: "I'm here" every few seconds while the tab is visible, "left" when the chat closes
  const beat = useCallback(
    (left = false) => {
      const d = draft.current;
      const typing = !!d.text.trim() && Date.now() - d.editedAt < TYPING_FOR_MS;
      const state = left ? "left" : typing ? (d.mode === "note" ? "note" : "reply") : "viewing";
      lastBeat.current = Date.now();
      return inboxApi.presence(id, state).then(
        (res) => {
          if (!left && res.data) setOthers(res.data.others);
        },
        () => undefined
      );
    },
    [id]
  );
  useEffect(() => {
    void beat();
    const timer = setInterval(() => {
      if (!document.hidden) void beat();
    }, BEAT_MS);
    return () => {
      clearInterval(timer);
      void beat(true);
    };
  }, [beat]);

  const onDraftChange = (text: string) => {
    if (!draft.current.text.trim() && text.trim()) seenWhenTyping.current = all.at(-1)?.id ?? 0;
    if (!text.trim()) seenWhenTyping.current = null;
    draft.current = { text, mode, editedAt: Date.now() };
    // tell colleagues right away when typing starts, not only on the next heartbeat
    if (text.trim() && Date.now() - lastBeat.current > 2000) void beat();
  };
  const changeMode = (next: ComposerMode) => {
    setMode(next);
    draft.current = { ...draft.current, mode: next };
  };

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

  const sendText = async (text: string, force = false) => {
    setSending(true);
    try {
      const res = await inboxApi.sendText(id, text, {
        reply_to_id: replyTo?.id,
        seen_message_id: seenWhenTyping.current ?? undefined,
        force,
      });
      afterSend(res.data, res.message);
      setReplyTo(null);
      setConflict(null);
      seenWhenTyping.current = null;
      return true;
    } catch (err) {
      const clash =
        err instanceof CustomerApiError && err.status === 409
          ? (err.data as { conflict?: ColleagueReply } | null)?.conflict
          : undefined;
      if (clash) {
        setConflict(clash); // keep the text: they read the colleague's reply, then decide
        void queryClient.invalidateQueries({ queryKey: INBOX_QK.MESSAGES(id) });
      } else {
        toast.error(errorMessage(err));
      }
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendNote = async (body: string) => {
    setSending(true);
    try {
      await inboxApi.addNote(id, body);
      stickToBottom.current = true;
      refreshTimeline();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendTemplate = (input: SendTemplateInput) => run(() => inboxApi.sendTemplate(id, input));
  const sendProducts = (input: SendProductsInput) => run(() => commerceApi.send(id, input));

  const [snoozeOpen, setSnoozeOpen] = useState(false);

  // Find in this chat, and jumping to a message (search results, starred messages)
  const [finding, setFinding] = useState(false);
  const [findText, setFindText] = useState("");
  const [found, setFound] = useState<{ q: string; ids: number[] } | null>(null);
  const [findPos, setFindPos] = useState(0);
  const [marks, setMarks] = useState<string[]>([]);
  const [currentHit, setCurrentHit] = useState<number | null>(null);

  /** Loads older pages until `target` is in the chat, then scrolls to it. */
  const reveal = async (target: number) => {
    let items = olderItems;
    let more = hasMore;
    let first = all[0]?.id;
    for (let guard = 0; first !== undefined && target < first && more && guard < 30; guard++) {
      const res = await inboxApi.messages(id, { before: first, limit: 100 });
      items = mergeById(res.data, items);
      more = res.meta.has_more;
      first = items[0]?.id ?? first;
    }
    if (items !== olderItems) setOlder({ id, items, hasMore: more });
    stickToBottom.current = false;
    setCurrentHit(target);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(`msg-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      )
    );
  };

  const jumped = useRef(false);
  useEffect(() => {
    if (!jump || jumped.current || latest.isLoading) return;
    jumped.current = true;
    setMarks(jump.words);
    void reveal(jump.messageId).catch(() => null);
    onJumped?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, latest.isLoading]);

  const runFind = async (q: string) => {
    const term = q.trim();
    if (!term) return;
    if (found && found.q === term && found.ids.length) {
      // Enter again: the next (older) match
      const next = (findPos + 1) % found.ids.length;
      setFindPos(next);
      void reveal(found.ids[next]!);
      return;
    }
    try {
      const res = await inboxApi.searchIn(id, term);
      setFound({ q: term, ids: res.data.ids });
      setMarks(res.data.words);
      setFindPos(0);
      if (res.data.ids.length) void reveal(res.data.ids[0]!);
      else setCurrentHit(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const stepFind = (delta: number) => {
    if (!found?.ids.length) return;
    const next = (findPos + delta + found.ids.length) % found.ids.length;
    setFindPos(next);
    void reveal(found.ids[next]!);
  };
  const closeFind = () => {
    setFinding(false);
    setFindText("");
    setFound(null);
    setMarks([]);
    setCurrentHit(null);
  };
  const live = { ...conversation, ...(fresh ?? {}) };
  const snoozed = !!live.snoozed_until;
  const act = async (task: () => Promise<{ message?: string; data: Conversation }>) => {
    try {
      const res = await task();
      // the message poll doesn't carry the pin, so keep the one the action returned
      onChanged(res.data);
      toast.success(res.message ?? "Done");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.ALL });
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };
  const toggleStar = async (m: InboxMessage) => {
    try {
      const res = m.star ? await inboxApi.unstar(m.id) : await inboxApi.star(m.id);
      queryClient.setQueryData(INBOX_QK.MESSAGES(id), (prev: typeof latest.data) =>
        prev ? { ...prev, data: mergeById(prev.data, [res.data]) } : prev
      );
      setOlder((o) =>
        o.id === id ? { ...o, items: o.items.map((x) => (x.id === m.id ? res.data : x)) } : o
      );
      void queryClient.invalidateQueries({ queryKey: ["inbox", "stars"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

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
            {others.length ? (
              <PresenceChip others={others} />
            ) : (
              <span className="text-fg-subtle block truncate text-xs">{contact.phone}</span>
            )}
          </span>
        </button>
        <div className="hidden sm:block">
          <WindowChip conversation={conversation} nowMs={nowMs} />
        </div>
        {!conversation.bot && !readOnly && (
          <div className="hidden sm:block">
            <StartBotMenu conversation={conversation} />
          </div>
        )}
        {!readOnly && (
          <Dropdown
            width="w-56"
            trigger={() => (
              <Button
                iconOnly
                variant={conversation.pin || snoozed ? "secondary" : "ghost"}
                size="sm"
                leftIcon={snoozed ? AlarmClock : conversation.pin ? Pin : Pin}
                aria-label="Pin or snooze"
              />
            )}
            items={[
              ...(conversation.pin
                ? [
                    {
                      label: conversation.pin === "everyone" ? "Unpin for everyone" : "Unpin",
                      icon: PinOff,
                      onClick: () => void act(() => inboxApi.unpin(id, conversation.pin ?? undefined)),
                    },
                  ]
                : [
                    { label: "Pin for me", icon: Pin, onClick: () => void act(() => inboxApi.pin(id, "me")) },
                    {
                      label: "Pin for everyone",
                      icon: Users,
                      onClick: () => void act(() => inboxApi.pin(id, "everyone")),
                    },
                  ]),
              ...(live.status !== "resolved"
                ? [
                    {
                      label: snoozed ? "Change snooze" : "Snooze…",
                      icon: AlarmClock,
                      onClick: () => setSnoozeOpen(true),
                    },
                  ]
                : []),
              ...(snoozed
                ? [
                    {
                      label: "Wake up now",
                      icon: AlarmClockOff,
                      onClick: () => void act(() => inboxApi.wake(id)),
                    },
                  ]
                : []),
            ]}
          />
        )}
        {!readOnly && <AssignMenu conversation={conversation} onChanged={onChanged} />}
        {readOnly ? null : conversation.status === "resolved" ? (
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
        <Tooltip label="Find in this chat" align="end">
          <Button
            iconOnly
            variant={finding ? "secondary" : "ghost"}
            size="sm"
            leftIcon={Search}
            aria-label="Find in this chat"
            aria-pressed={finding}
            onClick={() => (finding ? closeFind() : setFinding(true))}
          />
        </Tooltip>
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

      {finding && (
        <div className="border-line bg-surface flex items-center gap-2 border-b px-3 py-1.5 sm:px-4">
          <Search className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />
          <input
            autoFocus
            value={findText}
            onChange={(e) => {
              setFindText(e.target.value);
              if (found) setFound(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeFind();
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) stepFind(-1);
                else void runFind(findText);
              }
            }}
            placeholder="Find words in this chat, then Enter"
            aria-label="Find in this chat"
            className="text-fg placeholder:text-fg-faint min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          {found && (
            <span className="text-fg-subtle tabular shrink-0 text-xs" aria-live="polite">
              {found.ids.length ? `${findPos + 1} of ${found.ids.length}` : "No matches"}
            </span>
          )}
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            leftIcon={ChevronUp}
            aria-label="Older match"
            disabled={!found?.ids.length}
            onClick={() => stepFind(1)}
          />
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            leftIcon={ChevronDown}
            aria-label="Newer match"
            disabled={!found?.ids.length}
            onClick={() => stepFind(-1)}
          />
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            leftIcon={X}
            aria-label="Close find"
            onClick={closeFind}
          />
        </div>
      )}

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
                  {markersBefore(m, visible[i - 1]).map(renderMarker)}
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
                  <div
                    id={`msg-${m.id}`}
                    className={cn("scroll-mt-16", reactions.has(m.wamid ?? "") && "pb-3")}
                  >
                    <MessageBubble
                      message={m}
                      reactions={reactions.get(m.wamid ?? "") ?? []}
                      onReply={setReplyTo}
                      onOpenMedia={(msg) => setViewer(media.findIndex((x) => x.id === msg.id))}
                      onRetry={retry}
                      retrying={retryingId === m.id}
                      onStar={readOnly ? undefined : toggleStar}
                      highlight={marks.length ? marks : undefined}
                      current={m.id === currentHit}
                    />
                  </div>
                </Fragment>
              ))}
              {markersAfterLast.map(renderMarker)}
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

      {(snoozed || live.snooze_woke_at) && (
        <div
          role="status"
          className="border-line flex flex-wrap items-center gap-2 border-t bg-sky-50 px-3 py-2 text-xs sm:px-4 dark:bg-sky-500/10"
        >
          <AlarmClock className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
          <p className="text-fg min-w-0 flex-1">
            {snoozed ? (
              <>
                <b>
                  Snoozed until{" "}
                  {new Date(live.snoozed_until!).toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </b>
                {live.snooze_keep ? " (stays snoozed if the customer writes)" : ""}
              </>
            ) : (
              <b>Back from snooze</b>
            )}
            {live.snooze_note ? ` · ${live.snooze_note}` : ""}
          </p>
          {!readOnly && snoozed && (
            <>
              <Button size="xs" variant="secondary" onClick={() => setSnoozeOpen(true)}>
                Change
              </Button>
              <Button size="xs" variant="secondary" onClick={() => void act(() => inboxApi.wake(id))}>
                Wake now
              </Button>
            </>
          )}
          {!readOnly && !snoozed && (
            <Button
              iconOnly
              size="xs"
              variant="ghost"
              leftIcon={X}
              aria-label="Dismiss"
              onClick={() => void act(() => inboxApi.wake(id))}
            />
          )}
        </div>
      )}
      <BotBanner conversation={{ ...conversation, ...(fresh ?? {}) }} />
      {!(fresh ?? conversation).bot && (
        <AiBanner conversationId={conversation.id} lastMessageAt={(fresh ?? conversation).last_message_at} />
      )}
      <Composer
        windowOpen={conversation.window_open}
        blocked={contact.blocked}
        readOnly={readOnly}
        sending={sending}
        replyTo={replyTo}
        files={files}
        onFilesChange={setFiles}
        onCancelReply={() => setReplyTo(null)}
        onSendText={sendText}
        onSendNote={sendNote}
        conversationId={id}
        mode={mode}
        onModeChange={changeMode}
        onDraftChange={onDraftChange}
        conflict={conflict}
        onConflictEdit={() => {
          if (conflict) seenWhenTyping.current = conflict.id; // they've read it now
          setConflict(null);
        }}
        others={others}
        assignedTo={
          conversation.assignee && conversation.assignee.id !== me.id ? conversation.assignee.name : null
        }
        onSendFiles={sendFiles}
        onOpenTemplates={() => setTemplateOpen(true)}
        onOpenProducts={() => setProductsOpen(true)}
        onTyping={() => void inboxApi.typing(id).catch(() => null)}
      />

      {productsOpen && (
        <ProductModal
          open
          contactName={contact.display_name}
          onClose={() => setProductsOpen(false)}
          onSend={sendProducts}
        />
      )}

      {snoozeOpen && (
        <SnoozeDialog
          open
          initial={
            snoozed
              ? { until: live.snoozed_until, note: live.snooze_note, keep: live.snooze_keep }
              : undefined
          }
          onClose={() => setSnoozeOpen(false)}
          onSnooze={(body) => act(() => inboxApi.snooze(id, body))}
        />
      )}

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
