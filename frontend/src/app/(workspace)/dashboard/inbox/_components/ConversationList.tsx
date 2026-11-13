"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  AlarmClockOff,
  Bot,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Contact,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  MailOpen,
  MapPin,
  MessageSquarePlus,
  Mic,
  MousePointerClick,
  Pin,
  PinOff,
  Search,
  ShoppingCart,
  Star,
  Sticker,
  Undo2,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar, Button, Checkbox, Skeleton } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import type { BulkAction, Conversation, InboxSummary } from "../../_lib/inboxApi";
import { listTime } from "./format";
import { PresenceMark } from "./Presence";
import { Tooltip } from "../../_components/Tooltip";

export type ListFilter = "open" | "pending" | "resolved" | "all" | "snoozed";
export type OwnerFilter = "all" | "me" | "unassigned";

/** The preview without WhatsApp's *bold*, _italic_ and ~strike~ marks. */
const plainPreview = (text: string) =>
  text.replace(/(^|[\s(])([*_~])(\S(?:.*?\S)?)\2(?=[\s.,!?)]|$)/g, "$1$3");

/** Line icon shown before the preview for non-text messages (no emoji). */
const TYPE_ICONS: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
  sticker: Sticker,
  location: MapPin,
  contacts: Contact,
  template: LayoutTemplate,
  interactive: MousePointerClick,
  button: MousePointerClick,
  order: ShoppingCart,
};

const TABS: { key: ListFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
  { key: "snoozed", label: "Snoozed" },
];

const PINS_OPEN_KEY = "cd_inbox_pins_open";

function readPinsOpen() {
  try {
    return localStorage.getItem(PINS_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function ConversationList({
  items,
  loading,
  summary,
  filter,
  onFilter,
  owner,
  onOwner,
  unreadOnly,
  onUnreadOnly,
  search,
  onSearch,
  selectedId,
  onSelect,
  onNewChat,
  hasMore,
  onLoadMore,
  loadingMore,
  onStarred,
  onBulk,
}: {
  items: Conversation[];
  loading: boolean;
  summary: InboxSummary | undefined;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  owner: OwnerFilter;
  onOwner: (o: OwnerFilter) => void;
  unreadOnly: boolean;
  onUnreadOnly: (v: boolean) => void;
  search: string;
  onSearch: (v: string) => void;
  selectedId: number | null;
  onSelect: (c: Conversation) => void;
  /** left out for viewers, who can't start chats */
  onNewChat?: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  onStarred: () => void;
  /** the same action on many chats (left out for viewers); resolves to true when it worked */
  onBulk?: (ids: number[], action: BulkAction) => Promise<boolean>;
}) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pinsOpen, setPinsOpen] = useState(readPinsOpen);
  const sentinel = useRef<HTMLDivElement>(null);

  // Loads the next page when the bottom of the list scrolls into view
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loadingMore) onLoadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, items.length]);

  const togglePins = () => {
    setPinsOpen((open) => {
      try {
        localStorage.setItem(PINS_OPEN_KEY, open ? "0" : "1");
      } catch {}
      return !open;
    });
  };
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const run = async (action: BulkAction) => {
    if (!onBulk || !picked.size) return;
    if (await onBulk([...picked], action)) stopSelecting();
  };

  const pinned = filter === "snoozed" ? [] : items.filter((c) => c.pin);
  const rest = filter === "snoozed" ? items : items.filter((c) => !c.pin);
  const tabs = TABS.filter((t) => t.key !== "snoozed" || filter === "snoozed" || (summary?.snoozed ?? 0) > 0);
  const allPicked = items.length > 0 && items.every((c) => picked.has(c.id));

  const row = (c: Conversation) => (
    <ConversationRow
      key={c.id}
      conversation={c}
      active={c.id === selectedId}
      selecting={selecting}
      picked={picked.has(c.id)}
      onSelect={() => (selecting ? toggle(c.id) : onSelect(c))}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line space-y-2.5 border-b p-3">
        <div className="flex items-center gap-1">
          <h2 className="text-fg flex-1 text-base font-semibold">Chats</h2>
          <Tooltip label="Starred messages" align="end">
            <Button
              iconOnly
              variant="ghost"
              size="sm"
              leftIcon={Star}
              aria-label="Starred messages"
              onClick={onStarred}
            />
          </Tooltip>
          {onBulk && (
            <Tooltip label={selecting ? "Stop selecting" : "Select chats"} align="end">
              <Button
                iconOnly
                variant={selecting ? "secondary" : "ghost"}
                size="sm"
                leftIcon={selecting ? X : CheckSquare}
                aria-label={selecting ? "Stop selecting" : "Select chats"}
                aria-pressed={selecting}
                onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              />
            </Tooltip>
          )}
          {onNewChat && (
            <Tooltip label="New chat" align="end">
              <Button
                iconOnly
                variant="secondary"
                size="sm"
                leftIcon={MessageSquarePlus}
                aria-label="New chat"
                onClick={onNewChat}
              />
            </Tooltip>
          )}
        </div>
        <div
          className="bg-page grid grid-cols-3 gap-1 rounded-lg p-0.5"
          role="tablist"
          aria-label="Whose chats"
        >
          {(
            [
              ["me", "Mine", summary?.mine],
              ["unassigned", "Unassigned", summary?.unassigned],
              ["all", "Everyone", undefined],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={owner === key}
              onClick={() => onOwner(key)}
              className={cn(
                "flex h-7 items-center justify-center gap-1 rounded-md text-xs font-medium transition",
                owner === key ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg"
              )}
            >
              {label}
              {!!count && (
                <span className="tabular bg-primary text-primary-fg rounded-full px-1.5 text-[10px] font-bold">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
        <label className="border-line bg-page focus-within:border-primary flex h-8 items-center gap-2 rounded-md border px-2">
          <Search className="text-fg-faint h-3.5 w-3.5 shrink-0" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onSearch("")}
            placeholder="Search name, number or message"
            aria-label="Search chats"
            className="text-fg placeholder:text-fg-faint w-full bg-transparent text-[13px] outline-none"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch("")}
              className="text-fg-faint hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Chat status">
          {tabs.map((tab) => {
            const count = summary?.[tab.key];
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilter(tab.key)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition",
                  active
                    ? "bg-primary-soft text-primary font-semibold"
                    : "text-fg-subtle hover:bg-hover hover:text-fg"
                )}
              >
                {tab.key === "snoozed" && <AlarmClock className="h-3 w-3" aria-hidden />}
                {tab.label}
                {count !== undefined && <span className="tabular text-[11px] opacity-80">{count}</span>}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => onUnreadOnly(!unreadOnly)}
            className={cn(
              "ml-auto flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition",
              unreadOnly
                ? "border-primary bg-primary text-primary-fg"
                : "border-line text-fg-subtle hover:text-fg"
            )}
          >
            Unread {summary?.unread ? `(${summary.unread})` : ""}
          </button>
        </div>
      </div>

      {selecting && (
        <div className="border-line bg-page flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
          <Checkbox
            label={picked.size ? `${picked.size} selected` : "Select all"}
            checked={allPicked}
            indeterminate={picked.size > 0 && !allPicked}
            onChange={(on) => setPicked(on ? new Set(items.map((c) => c.id)) : new Set())}
          />
          <div className="ml-auto flex flex-wrap gap-1">
            {(
              [
                ["resolve", CheckCircle2, "Resolve"],
                ["snooze", AlarmClock, "Snooze"],
                ["wake", AlarmClockOff, "Wake"],
                ["pin", Pin, "Pin for me"],
                ["pin_everyone", Users, "Pin for everyone"],
                ["unpin", PinOff, "Unpin"],
                ["read", MailOpen, "Mark read"],
              ] as const
            ).map(([action, Icon, label]) => (
              <Tooltip key={action} label={label}>
                <Button
                  iconOnly
                  size="xs"
                  variant="secondary"
                  leftIcon={Icon}
                  aria-label={label}
                  disabled={!picked.size}
                  onClick={() => void run(action)}
                />
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Chats">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-fg-subtle px-6 py-12 text-center text-sm">
            <p className="text-fg font-medium">{search ? "No chats match" : "No chats here yet"}</p>
            <p className="mt-1 text-xs">
              {search
                ? "Try a different name, number or word."
                : filter === "snoozed"
                  ? "Snoozed chats wait here until their time comes."
                  : owner === "me"
                    ? "Nothing assigned to you right now. Check Unassigned to pick up a chat."
                    : filter === "open"
                      ? "When a customer messages your WhatsApp number, the chat appears here."
                      : "Nothing in this view."}
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Fragment>
                <button
                  type="button"
                  onClick={togglePins}
                  aria-expanded={pinsOpen}
                  className="text-fg-subtle hover:text-fg bg-page flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase"
                >
                  <Pin className="h-3 w-3" aria-hidden /> Pinned ({pinned.length})
                  <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition", !pinsOpen && "-rotate-90")} />
                </button>
                {pinsOpen && pinned.map(row)}
                {rest.length > 0 && (
                  <div className="text-fg-subtle bg-page px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
                    Chats
                  </div>
                )}
              </Fragment>
            )}
            {rest.map(row)}
            {hasMore && (
              <div ref={sentinel} className="p-3">
                <Button variant="ghost" size="sm" fullWidth loading={loadingMore} onClick={onLoadMore}>
                  Load more chats
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "4m", "2h", "3d" since the customer started waiting */
function waited(since: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

/** "in 3h", "Mon 9:00" until a snooze ends */
function until(at: string) {
  const d = new Date(at);
  const hours = (d.getTime() - Date.now()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

/** whole hours until `at` */
function hoursLeft(at: string) {
  return Math.max(0, Math.floor((new Date(at).getTime() - Date.now()) / 3_600_000));
}

function WindowBadge({ c }: { c: Conversation }) {
  if (c.status === "resolved" || !c.last_inbound_at) return null;
  if (c.window_open && c.window_expires_at) {
    const hours = hoursLeft(c.window_expires_at);
    return (
      <span
        className="bg-success-soft text-success shrink-0 rounded px-1 text-[10px] font-semibold"
        title={`Reply window open: about ${hours}h left`}
      >
        {hours}h
      </span>
    );
  }
  return (
    <span
      className="bg-hover text-fg-subtle shrink-0 rounded px-1 text-[10px] font-semibold"
      title="The 24-hour window is closed: only templates can be sent"
    >
      Template
    </span>
  );
}

function ConversationRow({
  conversation: c,
  active,
  selecting,
  picked,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  selecting: boolean;
  picked: boolean;
  onSelect: () => void;
}) {
  const unread = c.unread_count > 0;
  const TypeIcon = c.last_message_type ? TYPE_ICONS[c.last_message_type] : undefined;
  return (
    <button
      type="button"
      role="listitem"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "border-line/70 flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors",
        active || picked ? "bg-primary-soft" : "hover:bg-hover"
      )}
    >
      {selecting && (
        <span
          aria-hidden
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            picked ? "border-primary bg-primary text-primary-fg" : "border-line-strong bg-surface"
          )}
        >
          {picked && <CheckCircle2 className="h-3 w-3" />}
        </span>
      )}
      {selecting && <span className="sr-only">{picked ? "Selected" : "Not selected"}</span>}
      <Avatar name={c.contact.display_name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-fg min-w-0 flex-1 truncate text-sm",
              unread ? "font-semibold" : "font-medium"
            )}
          >
            {c.contact.display_name}
          </span>
          {c.pin && (
            <Pin
              className="text-fg-faint h-3 w-3 shrink-0 self-center"
              aria-label={c.pin === "everyone" ? "Pinned for everyone" : "Pinned for you"}
            />
          )}
          <span
            className={cn("shrink-0 text-[11px]", unread ? "text-primary font-semibold" : "text-fg-faint")}
          >
            {listTime(c.last_message_at)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {TypeIcon && <TypeIcon className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className={cn("min-w-0 flex-1 truncate text-xs", unread ? "text-fg" : "text-fg-subtle")}>
            {c.last_message_direction === "out" && <span className="text-fg-faint">You: </span>}
            {c.last_message_preview ? plainPreview(c.last_message_preview) : "No messages yet"}
          </span>
          {c.presence?.length ? <PresenceMark others={c.presence} /> : null}
          {c.snoozed_until ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
              title={`Snoozed until ${new Date(c.snoozed_until).toLocaleString()}${c.snooze_note ? `: ${c.snooze_note}` : ""}`}
            >
              <AlarmClock className="h-2.5 w-2.5" /> {until(c.snoozed_until)}
            </span>
          ) : c.snooze_woke_at ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
              title={c.snooze_note ? `Back from snooze: ${c.snooze_note}` : "Back from snooze"}
            >
              <Undo2 className="h-2.5 w-2.5" /> Back
            </span>
          ) : null}
          {c.waiting_since && c.status !== "resolved" && (
            <span
              className="bg-warning-soft text-warning shrink-0 rounded px-1 text-[10px] font-semibold"
              title="Waiting for a reply"
            >
              {waited(c.waiting_since)}
            </span>
          )}
          <WindowBadge c={c} />
          {c.bot && (
            <span
              title={`Chatbot ${c.bot} is talking`}
              className="text-primary shrink-0"
              aria-label="Chatbot running"
            >
              <Bot className="h-3.5 w-3.5" />
            </span>
          )}
          {c.assignee && (
            <span title={`Assigned to ${c.assignee.name}`} className="shrink-0">
              <Avatar name={c.assignee.name} size={16} />
            </span>
          )}
          {c.status === "pending" && (
            <span className="bg-warning-soft text-warning shrink-0 rounded px-1 text-[10px] font-semibold">
              Pending
            </span>
          )}
          {c.status === "resolved" && (
            <span className="bg-hover text-fg-subtle shrink-0 rounded px-1 text-[10px] font-semibold">
              Resolved
            </span>
          )}
          {unread && (
            <span className="tabular bg-primary text-primary-fg flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
