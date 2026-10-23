"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Brain,
  Code2,
  ExternalLink,
  FlaskConical,
  Globe,
  MessageCircle,
  MessagesSquare,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";

import { Badge, Button, Card, EmptyState, Skeleton } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { ChatText } from "@/lib/chatText";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import {
  AI_QK,
  aiAgentApi,
  usd,
  type Agent,
  type ThreadMessage,
  type ThreadRow,
} from "../../../_lib/aiAgentApi";

const CHANNEL: Record<ThreadRow["channel"], { label: string; icon: LucideIcon }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  web: { label: "Website", icon: Globe },
  api: { label: "API", icon: Code2 },
  test: { label: "Test", icon: FlaskConical },
};
const OUTCOME_LABEL: Record<string, string> = {
  answered: "Answered",
  cached: "Saved answer",
  handover: "Handed over",
  unknown: "Didn't know",
  failed: "Failed",
};

function who(t: ThreadRow) {
  return (
    t.visitor.name ||
    t.visitor.phone ||
    t.visitor.email ||
    (t.channel === "web" ? "Website visitor" : t.channel === "api" ? "API user" : "Visitor")
  );
}

function Transcript({ agent, threadId, onBack }: { agent: Agent; threadId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const thread = useQuery({
    queryKey: AI_QK.THREAD(agent.id, threadId),
    queryFn: () => aiAgentApi.thread(agent.id, threadId).then((r) => r.data),
  });
  const t = thread.data;
  const rate = async (m: ThreadMessage, value: "up" | "down") => {
    await aiAgentApi.feedback(agent.id, m.id, m.feedback === value ? null : value).catch(() => null);
    void qc.invalidateQueries({ queryKey: AI_QK.THREAD(agent.id, threadId) });
  };
  if (!t) return <Skeleton className="h-96 rounded-xl" />;
  const C = CHANNEL[t.channel];
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-line flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={ArrowLeft}
          aria-label="Back to conversations"
          onClick={onBack}
          className="lg:hidden"
        />
        <span className="bg-hover text-fg-subtle flex h-9 w-9 items-center justify-center rounded-full">
          <C.icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-semibold">{who(t)}</p>
          <p className="text-fg-subtle truncate text-xs">
            {C.label}
            {t.visitor.phone && t.visitor.name ? ` · ${t.visitor.phone}` : ""}
            {t.visitor.page ? ` · ${t.visitor.page.replace(/^https?:\/\//, "")}` : ""} · started{" "}
            {formatDateTime(t.created_at)}
          </p>
        </div>
        {t.conversation_id && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={ExternalLink}
            href={`${CUSTOMER_ROUTES.INBOX()}?c=${t.conversation_id}`}
          >
            Open in inbox
          </Button>
        )}
      </div>
      {t.summary && (
        <p className="bg-info-soft text-info flex items-start gap-2 px-4 py-2 text-xs">
          <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <b>What it remembers from earlier:</b> {t.summary}
          </span>
        </p>
      )}
      {t.status === "handover" && (
        <p className="bg-warning-soft text-warning px-4 py-2 text-xs">
          Handed to your team{t.handover_reason ? `: “${t.handover_reason}”` : ""}
        </p>
      )}
      <div
        className="bg-page min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
        role="log"
        aria-label="Transcript"
      >
        {t.items.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%]">
                <p className="bg-primary text-primary-fg rounded-2xl rounded-br-md px-3 py-2 text-sm whitespace-pre-wrap">
                  {m.text}
                </p>
                <p className="text-fg-faint mt-0.5 text-right text-[11px]">{timeAgo(m.created_at)}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[90%]">
              <div
                className={cn(
                  "border-line bg-surface text-fg rounded-2xl rounded-bl-md border px-3 py-2 text-sm",
                  m.outcome === "failed" && "border-danger/40"
                )}
              >
                {m.outcome === "failed" ? (
                  <span className="text-danger">{m.error ?? "Failed"}</span>
                ) : (
                  <ChatText text={m.text} style={t.channel === "whatsapp" ? "whatsapp" : "web"} />
                )}
              </div>
              <div className="text-fg-faint mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px]">
                {m.outcome && (
                  <span
                    className={cn(
                      m.outcome === "handover" || m.outcome === "unknown"
                        ? "text-warning"
                        : m.outcome === "failed"
                          ? "text-danger"
                          : "text-success"
                    )}
                  >
                    {OUTCOME_LABEL[m.outcome]}
                  </span>
                )}
                {m.sources.map((s) => (
                  <span key={s.id} className="bg-hover rounded-full px-1.5">
                    {s.title}
                  </span>
                ))}
                {m.outcome !== "cached" && m.outcome !== "failed" && (
                  <span className="tabular-nums">
                    {m.tokens.input + m.tokens.cached} in · {m.tokens.output} out · {usd(m.cost)}
                    {m.latency_ms ? ` · ${(m.latency_ms / 1000).toFixed(1)}s` : ""}
                  </span>
                )}
                <span>{timeAgo(m.created_at)}</span>
                <span className="ml-auto flex gap-0.5">
                  <button
                    type="button"
                    aria-label="Good answer"
                    aria-pressed={m.feedback === "up"}
                    onClick={() => rate(m, "up")}
                    className={cn("hover:bg-hover rounded p-0.5", m.feedback === "up" && "text-success")}
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Bad answer"
                    aria-pressed={m.feedback === "down"}
                    onClick={() => rate(m, "down")}
                    className={cn("hover:bg-hover rounded p-0.5", m.feedback === "down" && "text-danger")}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function Conversations({ agent }: { agent: Agent }) {
  const [channel, setChannel] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [open, setOpen] = useState<number | null>(null);
  const params = { channel: channel || undefined, status: status || undefined };
  const threads = useQuery({
    queryKey: AI_QK.THREADS(agent.id, params),
    queryFn: () => aiAgentApi.threads(agent.id, params).then((r) => r.data),
    refetchInterval: 15000,
  });
  const list = threads.data ?? [];
  const chips: [string, string][] = [
    ["", "All"],
    ["whatsapp", "WhatsApp"],
    ["web", "Website"],
    ["api", "API"],
    ["test", "Tests"],
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid min-h-[560px] lg:grid-cols-[340px_1fr]">
        <div
          className={cn("border-line flex min-h-0 flex-col lg:border-r", open !== null && "hidden lg:flex")}
        >
          <div className="border-line space-y-2 border-b p-3">
            <div className="no-scrollbar flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Channel">
              {chips.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={channel === v}
                  onClick={() => setChannel(v)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                    channel === v ? "bg-primary text-primary-fg" : "bg-hover text-fg-subtle"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label="Status">
              {[
                ["", "Any status"],
                ["handover", "Handed over"],
                ["paused", "Paused"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={status === v}
                  onClick={() => setStatus(v!)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    status === v ? "bg-surface-2 text-fg" : "text-fg-subtle"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {threads.isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Chats appear here once customers talk to the agent."
            />
          ) : (
            <ul className="divide-line min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Conversations">
              {list.map((t) => {
                const C = CHANNEL[t.channel];
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(t.id)}
                      aria-current={open === t.id}
                      className={cn(
                        "hover:bg-hover flex w-full items-start gap-3 px-3 py-3 text-left",
                        open === t.id && "bg-primary-soft"
                      )}
                    >
                      <span className="bg-hover text-fg-subtle mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                        <C.icon className="h-4 w-4" aria-label={C.label} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-fg truncate text-sm font-medium">{who(t)}</span>
                          <span className="text-fg-faint ml-auto shrink-0 text-[11px]">
                            {timeAgo(t.last_message_at)}
                          </span>
                        </span>
                        <span className="text-fg-subtle block truncate text-xs">
                          {t.last
                            ? `${t.last.role === "assistant" ? `${agent.name}: ` : ""}${t.last.text}`
                            : "—"}
                        </span>
                        <span className="mt-1 flex gap-1">
                          {t.status === "handover" && <Badge tone="warning">Handed over</Badge>}
                          {t.status === "paused" && <Badge>Paused</Badge>}
                          <span className="text-fg-faint text-[11px]">{t.messages} messages</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className={cn("min-h-0", open === null && "hidden lg:block")}>
          {open !== null ? (
            <Transcript key={open} agent={agent} threadId={open} onBack={() => setOpen(null)} />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="Pick a conversation"
              description="See every message, what it cost and which knowledge it used."
            />
          )}
        </div>
      </div>
    </Card>
  );
}
