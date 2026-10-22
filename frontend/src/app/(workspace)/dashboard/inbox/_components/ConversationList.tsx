"use client";

import {
  Check,
  Contact,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  MapPin,
  MessageSquarePlus,
  Mic,
  MousePointerClick,
  Search,
  Sticker,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar, Button, Skeleton } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import type { Conversation, InboxSummary } from "../../_lib/inboxApi";
import { listTime } from "./format";
import { Tooltip } from "../../_components/Tooltip";

export type ListFilter = "open" | "pending" | "resolved" | "all";
export type OwnerFilter = "all" | "me" | "unassigned";

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
};

const TABS: { key: ListFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

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
  onNewChat: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line space-y-2.5 border-b p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-fg flex-1 text-base font-semibold">Chats</h2>
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
          {TABS.map((tab) => {
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
                : owner === "me"
                  ? "Nothing assigned to you right now. Check Unassigned to pick up a chat."
                  : filter === "open"
                    ? "When a customer messages your WhatsApp number, the chat appears here."
                    : "Nothing in this view."}
            </p>
          </div>
        ) : (
          <>
            {items.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === selectedId}
                onSelect={() => onSelect(c)}
              />
            ))}
            {hasMore && (
              <div className="p-3">
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

function ConversationRow({
  conversation: c,
  active,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
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
        active ? "bg-primary-soft" : "hover:bg-hover"
      )}
    >
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
          <span
            className={cn("shrink-0 text-[11px]", unread ? "text-primary font-semibold" : "text-fg-faint")}
          >
            {listTime(c.last_message_at)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {c.last_message_direction === "out" && (
            <Check className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-label="You" />
          )}
          {TypeIcon && <TypeIcon className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className={cn("min-w-0 flex-1 truncate text-xs", unread ? "text-fg" : "text-fg-subtle")}>
            {c.last_message_preview ?? "No messages yet"}
          </span>
          {c.waiting_since && c.status !== "resolved" && (
            <span
              className="bg-warning-soft text-warning shrink-0 rounded px-1 text-[10px] font-semibold"
              title="Waiting for a reply"
            >
              {waited(c.waiting_since)}
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
