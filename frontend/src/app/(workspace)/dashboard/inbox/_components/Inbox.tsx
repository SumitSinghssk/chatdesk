"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, MessagesSquare, SlidersHorizontal, X } from "lucide-react";

import { Button, EmptyState } from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import {
  INBOX_QK,
  inboxApi,
  type BulkAction,
  type Conversation,
  type InboxFilters,
  type Page,
  type SavedView,
} from "../../_lib/inboxApi";
import { TEAM_QK, teamApi } from "../../_lib/teamApi";
import { FilterPanel, filterChips } from "./FilterPanel";
import { ViewsMenu } from "./ViewsMenu";
import { WORKSPACE_QK, whatsappApi } from "../../_lib/whatsappApi";
import { ChatPanel } from "./ChatPanel";
import { ContactPanel } from "./ContactPanel";
import { ConversationList, type ListFilter, type OwnerFilter } from "./ConversationList";
import { Tooltip } from "../../_components/Tooltip";
import { useDashboard } from "../../_components/DashboardContext";
import { NewChatModal } from "./NewChatModal";
import { SnoozeDialog } from "./SnoozeDialog";
import { StarredModal } from "./StarredModal";

const PAGE = 30;
const FILTERS_KEY = "cd_inbox_filters";

function readFilters(): InboxFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as InboxFilters) : {};
  } catch {
    return {};
  }
}

/** the words a search looks for, as the server splits them */
const searchWords = (term: string) => (term.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 8);
const conversationKey = (id: number) => ["inbox", "conversation", id] as const;

export function Inbox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const selectedId = Number(searchParams.get("c")) || null;
  const [filter, setFilter] = useState<ListFilter>("open");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [search, setSearch] = useState("");
  const [contactOpen, setContactOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches
  );
  const [newChatOpen, setNewChatOpen] = useState(false);
  const readOnly = useDashboard().me.role === "viewer";
  const [templateFor, setTemplateFor] = useState<number | null>(null);
  const debounced = useDebouncedValue(search.trim(), 300);

  const [starredOpen, setStarredOpen] = useState(false);
  const [filters, setFiltersState] = useState<InboxFilters>(readFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [jump, setJump] = useState<{ conversationId: number; messageId: number; words: string[] } | null>(
    null
  );
  const setFilters = (next: InboxFilters) => {
    setFiltersState(next);
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
    } catch {}
  };
  const members = useQuery({
    queryKey: TEAM_QK.MEMBERS,
    queryFn: async () => (await teamApi.members()).data,
    staleTime: 60_000,
    enabled: /^\d+$/.test(owner),
  });
  const [bulkSnooze, setBulkSnooze] = useState<number[] | null>(null);
  const bulkDone = useRef<((ok: boolean) => void) | null>(null);

  const params = {
    status: filter,
    assignee: owner === "all" ? undefined : owner,
    unread: unreadOnly || undefined,
    search: debounced || undefined,
    per_page: PAGE,
    ...filters,
    starred: filters.starred || undefined,
  };
  // pages load as the list scrolls; the poll refreshes every loaded page
  const list = useInfiniteQuery({
    queryKey: INBOX_QK.LIST(params),
    queryFn: ({ pageParam }) => inboxApi.conversations({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta && last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined,
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });
  const summary = useQuery({
    queryKey: INBOX_QK.SUMMARY,
    queryFn: async () => (await inboxApi.summary()).data,
    refetchInterval: 5000,
  });
  const connection = useQuery({
    queryKey: WORKSPACE_QK.CONNECTION,
    queryFn: async () => (await whatsappApi.connection()).data,
    staleTime: 60_000,
  });

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const fromList = items.find((c) => c.id === selectedId);
  const detail = useQuery({
    queryKey: conversationKey(selectedId ?? 0),
    queryFn: async () => (await inboxApi.conversation(selectedId!)).data,
    enabled: !!selectedId && !fromList,
  });
  // detail.data is kept current by onChanged (ChatPanel polls), so it wins over the list row
  const selected = (selectedId && (detail.data ?? fromList)) || null;

  const select = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set("c", String(id));
      else next.delete("c");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /** Writes a fresh copy of a conversation everywhere it is shown (list pages + open chat). */
  const onChanged = useCallback(
    (c: Conversation) => {
      queryClient.setQueryData(conversationKey(c.id), c);
      queryClient.setQueriesData<InfiniteData<Page<Conversation>>>({ queryKey: ["inbox", "list"] }, (prev) =>
        prev
          ? {
              ...prev,
              pages: prev.pages.map((page) => ({
                ...page,
                // the list knows who else is in each chat; single-chat answers don't
                data: page.data.map((row) => (row.id === c.id ? { ...c, presence: row.presence } : row)),
              })),
            }
          : prev
      );
    },
    [queryClient]
  );

  const notConnected = connection.data === null || connection.data?.status === "error";
  const total = list.data?.pages[0]?.meta?.total;
  const memberName = members.data?.find((m) => String(m.id) === owner);
  const chips = [
    ...filterChips(filters).map((chip) => ({
      key: chip.key as string,
      label: chip.label,
      remove: () => setFilters({ ...filters, [chip.key]: undefined }),
    })),
    ...(/^\d+$/.test(owner)
      ? [
          {
            key: "assignee",
            label: `Assigned to ${memberName?.name || memberName?.email || "a team member"}`,
            remove: () => setOwner("all"),
          },
        ]
      : []),
  ];
  const activeFilters = chips.length;
  const viewParams = {
    search: debounced || undefined,
    status: filter,
    assignee: owner === "all" ? undefined : owner,
    unread: unreadOnly || undefined,
    ...filters,
  };
  const applyView = (view: SavedView) => {
    const p = view.params;
    setSearch(typeof p.search === "string" ? p.search : "");
    setFilter((p.status as ListFilter) || "open");
    setOwner((p.assignee as OwnerFilter) || "all");
    setUnreadOnly(!!p.unread);
    setFilters({
      waiting: p.waiting ? Number(p.waiting) : undefined,
      attachment: (p.attachment as InboxFilters["attachment"]) || undefined,
      date_from: (p.date_from as string) || undefined,
      date_to: (p.date_to as string) || undefined,
      window: (p.window as InboxFilters["window"]) || undefined,
      starred: !!p.starred || undefined,
      tag: (p.tag as string) || undefined,
    });
  };

  const runBulk = async (ids: number[], action: BulkAction, until?: string, note?: string | null) => {
    try {
      const res = await inboxApi.bulk({ ids, action, until, note });
      toast.success(res.message ?? "Done");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.ALL });
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };
  const onBulk = (ids: number[], action: BulkAction) => {
    if (action !== "snooze") return runBulk(ids, action);
    // snoozing needs a time first: the dialog answers the list's promise
    return new Promise<boolean>((resolve) => {
      bulkDone.current = resolve;
      setBulkSnooze(ids);
    });
  };
  const closeBulkSnooze = (ok: boolean) => {
    bulkDone.current?.(ok);
    bulkDone.current = null;
    setBulkSnooze(null);
  };

  return (
    <div className="bg-surface relative -m-3 flex h-[calc(100%+1.5rem)] min-h-0 overflow-hidden sm:-m-4 sm:h-[calc(100%+2rem)]">
      <div
        className={cn("border-line w-full shrink-0 border-r lg:w-80 xl:w-96", selected && "hidden lg:block")}
      >
        {notConnected && (
          <div className="border-line bg-warning-soft text-warning border-b px-3 py-2 text-xs">
            {connection.data === null
              ? "No WhatsApp number connected."
              : "Your WhatsApp connection has a problem."}{" "}
            <a href={CUSTOMER_ROUTES.WHATSAPP()} className="font-semibold underline">
              Open WhatsApp setup
            </a>
          </div>
        )}
        <ConversationList
          items={items}
          loading={list.isLoading}
          summary={summary.data}
          filter={filter}
          onFilter={setFilter}
          owner={owner}
          onOwner={setOwner}
          unreadOnly={unreadOnly}
          onUnreadOnly={setUnreadOnly}
          search={search}
          onSearch={setSearch}
          selectedId={selectedId}
          onSelect={(c) => {
            onChanged(c);
            // a search hit opens the chat at the matching message
            setJump(
              c.match?.message_id && debounced
                ? { conversationId: c.id, messageId: c.match.message_id, words: searchWords(debounced) }
                : null
            );
            select(c.id);
          }}
          searchWords={debounced ? searchWords(debounced) : undefined}
          headerExtra={
            <>
              <Tooltip label="Filters" align="end">
                <span className="relative inline-flex">
                  <Button
                    iconOnly
                    variant={activeFilters ? "secondary" : "ghost"}
                    size="sm"
                    leftIcon={SlidersHorizontal}
                    aria-label={activeFilters ? `Filters (${activeFilters} on)` : "Filters"}
                    onClick={() => setFiltersOpen(true)}
                  />
                  {activeFilters > 0 && (
                    <span className="bg-primary text-primary-fg pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                      {activeFilters}
                    </span>
                  )}
                </span>
              </Tooltip>
              <ViewsMenu
                current={viewParams}
                canSave={!!debounced || activeFilters > 0 || owner !== "all" || unreadOnly}
                readOnly={readOnly}
                onApply={applyView}
              />
            </>
          }
          chips={
            chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-[11px] font-medium"
                  >
                    {chip.label}
                    <button
                      type="button"
                      aria-label={`Remove filter ${chip.label}`}
                      onClick={chip.remove}
                      className="hover:bg-primary/15 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setFilters({});
                    if (/^\d+$/.test(owner)) setOwner("all");
                  }}
                  className="text-fg-subtle hover:text-fg text-[11px] font-medium underline-offset-2 hover:underline"
                >
                  Clear all
                </button>
                {total !== undefined && (
                  <span className="text-fg-faint ml-auto text-[11px]">{total} chats</span>
                )}
              </div>
            ) : undefined
          }
          onNewChat={readOnly ? undefined : () => setNewChatOpen(true)}
          hasMore={!!list.hasNextPage}
          onLoadMore={() => {
            if (!list.isFetchingNextPage) void list.fetchNextPage();
          }}
          loadingMore={list.isFetchingNextPage}
          onStarred={() => setStarredOpen(true)}
          onBulk={readOnly ? undefined : onBulk}
        />
      </div>

      <div className={cn("min-w-0 flex-1", selected ? "flex" : "hidden lg:flex")}>
        {selected ? (
          <ChatPanel
            key={selected.id}
            conversation={selected}
            onBack={() => select(null)}
            onChanged={onChanged}
            contactOpen={contactOpen}
            onToggleContact={() => setContactOpen((v) => !v)}
            autoTemplate={templateFor === selected.id}
            onTemplateShown={() => setTemplateFor(null)}
            jump={jump && jump.conversationId === selected.id ? jump : null}
            onJumped={() => setJump(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-[#efeae2] p-6 dark:bg-[#0b141a]">
            <div className="bg-surface/90 max-w-sm rounded-2xl p-6 shadow-xs">
              {notConnected ? (
                <EmptyState
                  icon={MessageCircle}
                  title="Connect WhatsApp to start chatting"
                  description="Messages to your WhatsApp Business number will appear here."
                  action={<Button href={CUSTOMER_ROUTES.WHATSAPP()}>WhatsApp setup</Button>}
                />
              ) : (
                <EmptyState
                  icon={MessagesSquare}
                  title="Select a chat"
                  description="Pick a conversation on the left, or start a new one with any WhatsApp number."
                  action={
                    readOnly ? undefined : (
                      <Button variant="secondary" onClick={() => setNewChatOpen(true)}>
                        New chat
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>

      {selected && contactOpen && (
        <>
          <button
            type="button"
            aria-label="Close contact panel"
            className="absolute inset-0 z-20 bg-slate-950/30 xl:hidden"
            onClick={() => setContactOpen(false)}
          />
          <div className="border-line absolute inset-y-0 right-0 z-30 w-[min(20rem,100%)] border-l shadow-xl xl:static xl:z-auto xl:w-80 xl:shadow-none">
            <ContactPanel
              key={selected.id}
              conversation={selected}
              onChanged={onChanged}
              onClose={() => setContactOpen(false)}
            />
          </div>
        </>
      )}

      {filtersOpen && (
        <FilterPanel
          open
          filters={filters}
          assignee={/^\d+$/.test(owner) ? owner : ""}
          onClose={() => setFiltersOpen(false)}
          onApply={(next, who) => {
            setFilters(next);
            if (who) setOwner(who as OwnerFilter);
            else if (/^\d+$/.test(owner)) setOwner("all");
          }}
        />
      )}

      <StarredModal
        open={starredOpen}
        onClose={() => setStarredOpen(false)}
        onOpen={(item) => {
          setJump({ conversationId: item.conversation.id, messageId: item.message.id, words: [] });
          select(item.conversation.id);
        }}
      />

      {bulkSnooze && (
        <SnoozeDialog
          open
          count={bulkSnooze.length}
          onClose={() => closeBulkSnooze(false)}
          onSnooze={async (body) => {
            const ok = await runBulk(bulkSnooze, "snooze", body.until, body.note);
            if (ok) closeBulkSnooze(true);
            return ok;
          }}
        />
      )}

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onStarted={(c) => {
          setNewChatOpen(false);
          onChanged(c);
          void queryClient.invalidateQueries({ queryKey: INBOX_QK.ALL });
          setTemplateFor(c.window_open ? null : c.id);
          setFilter("all");
          select(c.id);
        }}
      />
    </div>
  );
}
