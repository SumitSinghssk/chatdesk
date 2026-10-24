"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Database,
  FileText,
  Globe,
  HelpCircle,
  MessageCircle,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
  UserRoundCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { ChatText } from "@/lib/chatText";
import { cn } from "@/lib/utils";

import {
  AI_QK,
  aiAgentApi,
  readStream,
  usd,
  type Agent,
  type ReplyInfo,
  type SourceKind,
} from "../../../_lib/aiAgentApi";

type Line =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      info?: ReplyInfo;
      streaming?: boolean;
      feedback?: "up" | "down" | null;
    }
  | { id: string; role: "error"; text: string };

const SOURCE_ICON: Record<SourceKind, LucideIcon> = {
  file: FileText,
  url: Globe,
  text: StickyNote,
  faq: HelpCircle,
};
const OUTCOME: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  answered: { label: "Answered", icon: Sparkles, className: "text-success" },
  cached: { label: "Saved answer · no AI cost", icon: Database, className: "text-info" },
  handover: { label: "Handed to your team", icon: UserRoundCheck, className: "text-warning" },
  unknown: { label: "Didn't know", icon: HelpCircle, className: "text-warning" },
  failed: { label: "Failed", icon: AlertTriangle, className: "text-danger" },
};

const WA_BG =
  "bg-[#efeae2] dark:bg-[#0b141a] [background-image:radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] dark:[background-image:radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:14px_14px]";

function Meta({ info }: { info: ReplyInfo }) {
  const o = OUTCOME[info.outcome] ?? OUTCOME.answered!;
  const seconds = info.latency_ms != null ? `${(info.latency_ms / 1000).toFixed(1)}s` : null;
  return (
    <div className="mt-1 space-y-1 px-1 text-[11px]">
      <p className={cn("flex items-center gap-1 font-medium", o.className)}>
        <o.icon className="h-3 w-3" aria-hidden /> {o.label}
      </p>
      {info.sources.length > 0 && (
        <p className="flex flex-wrap gap-1" aria-label="Sources used">
          {info.sources.map((s) => {
            const Icon = SOURCE_ICON[s.kind] ?? FileText;
            return (
              <span
                key={s.id}
                className="bg-surface border-line text-fg-subtle inline-flex max-w-[200px] items-center gap-1 rounded-full border px-1.5 py-0.5"
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{s.title}</span>
              </span>
            );
          })}
        </p>
      )}
      {info.outcome !== "cached" && (
        <p className="text-fg-faint flex flex-wrap items-center gap-x-2 tabular-nums">
          {seconds && (
            <span className="inline-flex items-center gap-0.5">
              <Zap className="h-3 w-3" aria-hidden /> {seconds}
            </span>
          )}
          <span>
            {info.tokens.input + info.tokens.cached} in
            {info.tokens.cached ? ` (${info.tokens.cached} cached)` : ""} · {info.tokens.output} out
          </span>
          <span>{usd(info.cost)}</span>
          {info.saved > 0 && <span className="text-success">saved {usd(info.saved)}</span>}
        </p>
      )}
    </div>
  );
}

export function TestChat({ agent, className }: { agent: Agent; className?: string }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [thread, setThread] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<"web" | "whatsapp">("web");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  const send = async (message: string) => {
    const q = message.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const id = `${Date.now()}`;
    setLines((l) => [
      ...l,
      { id: `u${id}`, role: "user", text: q },
      { id: `a${id}`, role: "assistant", text: "", streaming: true },
    ]);
    const patch = (fn: (line: Extract<Line, { role: "assistant" }>) => Line) =>
      setLines((l) => l.map((line) => (line.id === `a${id}` && line.role === "assistant" ? fn(line) : line)));
    try {
      const res = await aiAgentApi.test(agent.id, { message: q, thread_id: thread, channel: style });
      await readStream<ReplyInfo>(res, {
        onThread: (t) => t.id && setThread(t.id),
        onDelta: (piece) => patch((line) => ({ ...line, text: line.text + piece })),
        onDone: (info) => patch((line) => ({ ...line, text: info.text, info, streaming: false })),
        onError: (err) =>
          setLines((l) =>
            l.map((line) => (line.id === `a${id}` ? { id: line.id, role: "error", text: err.message } : line))
          ),
      });
      void qc.invalidateQueries({ queryKey: AI_QK.AGENT(agent.id) });
    } catch (err) {
      setLines((l) =>
        l.map((line) =>
          line.id === `a${id}` ? { id: line.id, role: "error", text: errorMessage(err) } : line
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const rate = async (line: Extract<Line, { role: "assistant" }>, value: "up" | "down") => {
    if (!line.info) return;
    const next = line.feedback === value ? null : value;
    setLines((l) => l.map((x) => (x.id === line.id ? { ...line, feedback: next } : x)));
    await aiAgentApi.feedback(agent.id, line.info.id, next).catch(() => null);
  };

  const reset = () => {
    setLines([]);
    setThread(null);
  };
  const wa = style === "whatsapp";
  const ideas = agent.widget.suggestions.length
    ? agent.widget.suggestions
    : ["What are your timings?", "Do you deliver?", "I want to talk to a person"];

  return (
    <section className={cn("bg-surface flex min-h-0 flex-col", className)} aria-label="Test chat">
      <div className="border-line flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="text-primary h-4.5 w-4.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-fg text-sm font-semibold">Test {agent.name}</p>
          <p className="text-fg-subtle truncate text-xs">
            Real answers from your knowledge · costs real tokens
          </p>
        </div>
        <div className="bg-hover flex rounded-lg p-0.5" role="radiogroup" aria-label="Preview as">
          {(
            [
              ["web", Globe, "Website"],
              ["whatsapp", MessageCircle, "WhatsApp"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={style === value}
              title={`Reply like on ${label}`}
              onClick={() => {
                setStyle(value);
                reset();
              }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition",
                style === value ? "bg-surface text-fg shadow-xs" : "text-fg-subtle"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={RotateCcw}
          aria-label="Start a new test chat"
          onClick={reset}
          disabled={busy}
        />
      </div>
      {agent.problem && (
        <p className="bg-warning-soft text-warning flex items-start gap-1.5 px-4 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {agent.problem}
        </p>
      )}
      <div ref={scroller} className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-4", wa ? WA_BG : "bg-page")}>
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-xl">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-fg-subtle max-w-xs text-sm">
              Ask what your customers ask. It remembers this chat, so try follow-up questions too.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {ideas.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="border-line bg-surface text-fg hover:bg-hover rounded-full border px-3 py-1 text-xs"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2" role="log" aria-label="Test messages" aria-live="polite">
            {lines.map((line) =>
              line.role === "user" ? (
                <div key={line.id} className="flex justify-end">
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                      wa
                        ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                        : "bg-primary text-primary-fg rounded-br-md"
                    )}
                  >
                    {line.text}
                  </p>
                </div>
              ) : line.role === "error" ? (
                <p
                  key={line.id}
                  role="alert"
                  className="bg-danger-soft text-danger flex max-w-[90%] items-start gap-1.5 rounded-xl px-3 py-2 text-sm"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {line.text}
                </p>
              ) : (
                <div key={line.id} className="max-w-[90%]">
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm break-words",
                      wa
                        ? "rounded-tl-none bg-white text-[#111b21] shadow-xs dark:bg-[#202c33] dark:text-[#e9edef]"
                        : "bg-surface border-line text-fg rounded-bl-md border"
                    )}
                  >
                    {line.text ? (
                      <ChatText text={line.text} style={style} />
                    ) : (
                      <span className="flex gap-1 py-1" aria-label="Typing">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="bg-fg-faint h-1.5 w-1.5 animate-bounce rounded-full"
                            style={{ animationDelay: `${i * 120}ms` }}
                          />
                        ))}
                      </span>
                    )}
                    {line.streaming && line.text && (
                      <span
                        className="bg-primary ml-0.5 inline-block h-3.5 w-1 animate-pulse align-middle"
                        aria-hidden
                      />
                    )}
                  </div>
                  {line.info && (
                    <div className="flex items-start justify-between gap-2">
                      <Meta info={line.info} />
                      <span className="mt-1 flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          aria-label="Good answer"
                          aria-pressed={line.feedback === "up"}
                          onClick={() => rate(line, "up")}
                          className={cn(
                            "hover:bg-hover rounded p-1",
                            line.feedback === "up" ? "text-success" : "text-fg-faint"
                          )}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Bad answer"
                          aria-pressed={line.feedback === "down"}
                          onClick={() => rate(line, "down")}
                          className={cn(
                            "hover:bg-hover rounded p-1",
                            line.feedback === "down" ? "text-danger" : "text-fg-faint"
                          )}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
      <form
        className="border-line flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="ai-test-input" className="sr-only">
          Message
        </label>
        <textarea
          id="ai-test-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder="Type a customer question…"
          className="border-line bg-surface text-fg focus:border-primary focus:ring-primary/20 max-h-32 min-h-10 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
        />
        <Button
          type="submit"
          iconOnly
          leftIcon={SendHorizontal}
          aria-label="Send"
          loading={busy}
          disabled={!text.trim()}
        />
      </form>
    </section>
  );
}
