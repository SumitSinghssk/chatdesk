"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, Star } from "lucide-react";

import { Button, EmptyState, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

import { INBOX_QK, inboxApi, type StarredItem } from "../../_lib/inboxApi";
import { bubbleTime, dayLabel } from "./format";

function preview(item: StarredItem) {
  const m = item.message;
  return m.text || m.media_filename || `[${m.type}]`;
}

/** Starred messages: across every chat the person can see, or just one chat. */
export function StarredList({
  conversationId,
  onOpen,
  compact = false,
}: {
  conversationId?: number;
  onOpen: (item: StarredItem) => void;
  compact?: boolean;
}) {
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search.trim(), 300);
  const params = { conversation_id: conversationId, mine: mine || undefined, search: term || undefined };
  const query = useInfiniteQuery({
    queryKey: INBOX_QK.STARS(params),
    queryFn: ({ pageParam }) => inboxApi.stars({ ...params, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.meta.has_more ? last.data.at(-1)?.id : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="border-line bg-page focus-within:border-primary flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2">
            <Search className="text-fg-faint h-3.5 w-3.5 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search starred messages and notes"
              aria-label="Search starred messages"
              className="text-fg placeholder:text-fg-faint w-full bg-transparent text-[13px] outline-none"
            />
          </label>
          <div className="bg-page flex rounded-md p-0.5 text-xs" role="tablist">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                role="tab"
                aria-selected={mine === v}
                onClick={() => setMine(v)}
                className={cn(
                  "rounded px-2 py-1 font-medium",
                  mine === v ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg"
                )}
              >
                {v ? "Starred by me" : "Everyone's"}
              </button>
            ))}
          </div>
        </div>
      )}
      {query.isLoading ? (
        <Skeleton className="h-24" />
      ) : !items.length ? (
        compact ? (
          <p className="text-fg-faint text-xs">No starred messages in this chat.</p>
        ) : (
          <EmptyState
            icon={Star}
            title={term ? "Nothing matches" : "No starred messages yet"}
            description="Hover a message in a chat and press the star to keep it handy for the team."
            className="py-8"
          />
        )
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="border-line hover:border-primary/40 hover:bg-hover w-full rounded-lg border p-2.5 text-left transition"
              >
                <span className="text-fg-subtle flex items-center gap-1.5 text-[11px]">
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
                  {!conversationId && (
                    <span className="text-fg truncate font-semibold">{item.conversation.contact}</span>
                  )}
                  <span className="shrink-0">
                    · {item.message.direction === "in" ? "Customer" : "You"} ·{" "}
                    {dayLabel(item.message.created_at)} {bubbleTime(item.message.created_at)}
                  </span>
                </span>
                <span className="text-fg mt-1 line-clamp-2 block text-xs">{preview(item)}</span>
                {item.note && (
                  <span className="mt-1 block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    {item.note}
                    {item.by ? ` · ${item.by.name}` : ""}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          fullWidth
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

export function StarredModal({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (item: StarredItem) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Starred messages"
      description="Kept handy for the whole team."
    >
      {open && (
        <StarredList
          onOpen={(item) => {
            onClose();
            onOpen(item);
          }}
        />
      )}
    </Modal>
  );
}
