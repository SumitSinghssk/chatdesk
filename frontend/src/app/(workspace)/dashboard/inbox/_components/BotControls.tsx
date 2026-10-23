"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Square } from "lucide-react";
import { toast } from "sonner";

import { Button, Dropdown } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";

import { CHATBOTS_QK, chatbotsApi } from "../../_lib/chatbotsApi";
import { INBOX_QK, type Conversation } from "../../_lib/inboxApi";

/** Header button: start a published chatbot in this chat. */
export function StartBotMenu({ conversation }: { conversation: Conversation }) {
  const queryClient = useQueryClient();
  const bots = useQuery({
    queryKey: CHATBOTS_QK.LIVE,
    queryFn: async () => (await chatbotsApi.live()).data,
    staleTime: 60_000,
  });
  const start = async (id: number) => {
    try {
      const res = await chatbotsApi.startInChat(id, conversation.id);
      toast.success(res.message ?? "Chatbot started");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const list = bots.data ?? [];
  return (
    <Dropdown
      align="right"
      width="w-64"
      header={<span className="text-fg-subtle text-xs font-medium">Start a chatbot in this chat</span>}
      trigger={() => (
        <span
          aria-label="Start a chatbot"
          title="Start a chatbot"
          className="text-fg-subtle hover:bg-hover hover:text-fg flex h-8 w-8 items-center justify-center rounded-lg"
        >
          <Bot className="h-4.5 w-4.5" />
        </span>
      )}
      items={
        !conversation.window_open
          ? [{ label: "The 24-hour window is closed", disabled: true }]
          : bots.isLoading
            ? [{ label: "Loading…", disabled: true }]
            : list.length
              ? list.map((b) => ({ label: b.name, icon: Bot, onClick: () => void start(b.id) }))
              : [{ label: "No published chatbots yet", disabled: true }]
      }
    />
  );
}

/** Above the composer while a chatbot talks in the chat. */
export function BotBanner({ conversation }: { conversation: Conversation }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const session = conversation.bot_session;
  if (!conversation.bot) return null;
  const stop = async () => {
    setBusy(true);
    try {
      await chatbotsApi.stopInChat(conversation.id);
      toast.success("Chatbot stopped");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="border-line bg-primary-soft/60 flex items-center gap-2 border-t px-3 py-2 text-xs sm:px-4"
      role="status"
      aria-label="Chatbot running"
    >
      <Bot className="text-primary h-4 w-4 shrink-0" aria-hidden />
      <p className="text-fg min-w-0 flex-1 truncate">
        Chatbot <b>{conversation.bot}</b> is talking to this customer
        {session?.node ? <span className="text-fg-subtle"> · at “{session.node}”</span> : null}. Your reply
        stops it.
      </p>
      <Button size="xs" variant="secondary" leftIcon={Square} loading={busy} onClick={stop}>
        Stop
      </Button>
    </div>
  );
}
