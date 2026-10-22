"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, MessagesSquare } from "lucide-react";

import { Button, EmptyState } from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { INBOX_QK, inboxApi, type Conversation, type Page } from "../../_lib/inboxApi";
import { WORKSPACE_QK, whatsappApi } from "../../_lib/whatsappApi";
import { ChatPanel } from "./ChatPanel";
import { ContactPanel } from "./ContactPanel";
import { ConversationList, type ListFilter } from "./ConversationList";
import { NewChatModal } from "./NewChatModal";

const PAGE = 30;
const conversationKey = (id: number) => ["inbox", "conversation", id] as const;

export function Inbox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const selectedId = Number(searchParams.get("c")) || null;
  const [filter, setFilter] = useState<ListFilter>("open");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(PAGE);
  const [contactOpen, setContactOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches
  );
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [templateFor, setTemplateFor] = useState<number | null>(null);
  const debounced = useDebouncedValue(search.trim(), 300);

  const params = {
    status: filter,
    unread: unreadOnly || undefined,
    search: debounced || undefined,
    page: 1,
    per_page: perPage,
  };
  const list = useQuery({
    queryKey: INBOX_QK.LIST(params),
    queryFn: () => inboxApi.conversations(params),
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

  const fromList = list.data?.data.find((c) => c.id === selectedId);
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
      queryClient.setQueriesData<Page<Conversation>>({ queryKey: ["inbox", "list"] }, (prev) =>
        prev ? { ...prev, data: prev.data.map((row) => (row.id === c.id ? c : row)) } : prev
      );
    },
    [queryClient]
  );

  const notConnected = connection.data === null || connection.data?.status === "error";
  const items = list.data?.data ?? [];
  const meta = list.data?.meta;

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
          onFilter={(f) => {
            setFilter(f);
            setPerPage(PAGE);
          }}
          unreadOnly={unreadOnly}
          onUnreadOnly={setUnreadOnly}
          search={search}
          onSearch={setSearch}
          selectedId={selectedId}
          onSelect={(c) => {
            onChanged(c);
            select(c.id);
          }}
          onNewChat={() => setNewChatOpen(true)}
          hasMore={!!meta && meta.total > items.length}
          onLoadMore={() => setPerPage((n) => n + PAGE)}
          loadingMore={list.isFetching && !list.isLoading}
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
                    <Button variant="secondary" onClick={() => setNewChatOpen(true)}>
                      New chat
                    </Button>
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
