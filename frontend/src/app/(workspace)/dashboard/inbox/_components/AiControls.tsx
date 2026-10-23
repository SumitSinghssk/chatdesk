"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { AI_QK, aiAgentApi } from "../../_lib/aiAgentApi";

/** Shows whether the AI agent answers this WhatsApp chat, with pause / resume. */
export function AiBanner({
  conversationId,
  lastMessageAt,
}: {
  conversationId: number;
  lastMessageAt: string | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const state = useQuery({
    queryKey: [...AI_QK.CHAT(conversationId), lastMessageAt],
    queryFn: () => aiAgentApi.chatState(conversationId).then((r) => r.data),
    staleTime: 10_000,
  });
  const s = state.data;
  if (!s || s.problem) return null;

  const act = async (resume: boolean) => {
    setBusy(true);
    try {
      const res = resume
        ? await aiAgentApi.resumeChat(conversationId)
        : await aiAgentApi.pauseChat(conversationId);
      toast.success(res.message ?? "Done");
      await qc.invalidateQueries({ queryKey: AI_QK.CHAT(conversationId) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const active = s.state === "active";
  const text = {
    active: (
      <>
        AI agent <b>{s.agent.name}</b> answers this chat. Your reply makes it step back.
      </>
    ),
    team: (
      <>
        AI agent <b>{s.agent.name}</b> is quiet because your team is replying.
      </>
    ),
    handover: (
      <>
        <b>{s.agent.name}</b> handed this chat to your team
        {s.handover_reason ? <span className="text-fg-subtle"> · “{s.handover_reason}”</span> : null}.
        It&apos;s back once the chat is resolved.
      </>
    ),
    paused: (
      <>
        AI agent <b>{s.agent.name}</b> is paused for this chat.
      </>
    ),
  }[s.state];

  return (
    <div
      className={cn(
        "border-line flex items-center gap-2 border-t px-3 py-2 text-xs sm:px-4",
        active ? "bg-primary-soft/60" : "bg-warning-soft/60"
      )}
      role="status"
      aria-label="AI agent"
    >
      <Sparkles className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-warning")} aria-hidden />
      <p className="text-fg min-w-0 flex-1 truncate">{text}</p>
      {active ? (
        <Button size="xs" variant="secondary" leftIcon={Pause} loading={busy} onClick={() => act(false)}>
          Pause
        </Button>
      ) : (
        <Button size="xs" variant="secondary" leftIcon={Play} loading={busy} onClick={() => act(true)}>
          {s.state === "paused" ? "Resume" : "Turn on"}
        </Button>
      )}
    </div>
  );
}
