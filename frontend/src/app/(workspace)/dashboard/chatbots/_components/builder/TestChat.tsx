"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCheck,
  Flag,
  GitBranch,
  Globe,
  List as ListIcon,
  Paperclip,
  Play,
  Repeat2,
  Reply,
  RotateCcw,
  SendHorizontal,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button, Input } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { TemplateBubble } from "../../../_components/whatsapp/TemplatePreview";
import {
  chatbotsApi,
  type BotGraph,
  type BotSettings,
  type SimEvent,
  type SimReply,
  type SimResult,
  type SimState,
} from "../../../_lib/chatbotsApi";
import { templatesApi } from "../../../_lib/templatesApi";
import { previewOf } from "../../../automation/_components/ReplyFields";

type Line =
  | { id: number; from: "bot"; reply: SimReply; node: string | null }
  | { id: number; from: "me"; text: string }
  | { id: number; from: "note"; kind: string; text: string }
  | { id: number; from: "typing" };
type NewLine = Line extends infer L ? (L extends Line ? Omit<L, "id"> : never) : never;

const NOTE_ICONS: Record<string, LucideIcon> = {
  action: Tag,
  condition: GitBranch,
  webhook: Globe,
  handover: UserRound,
  goto: Repeat2,
  error: AlertTriangle,
  end: Flag,
  note: Check,
};

const PLACEHOLDER: Record<string, string> = {
  text: "Type your answer",
  number: "Type a number",
  email: "Type an email address",
  phone: "Type a phone number",
  date: "Type a date, e.g. 25/12/2026",
  media: "Tap the clip to send a photo",
};

const CHAT_BG =
  "bg-[#efeae2] dark:bg-[#0b141a] [background-image:radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] dark:[background-image:radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:14px_14px]";

function bubbleOf(reply: SimReply) {
  if (reply.type === "buttons") {
    const fmt = reply.header_type ?? "none";
    return {
      template: {
        header: { format: fmt, text: reply.header ?? null },
        body: reply.text ?? "",
        footer: reply.footer ?? null,
        buttons: [],
      },
      media: ["image", "video", "document"].includes(fmt)
        ? {
            url: reply.media_key
              ? templatesApi.sampleUrl(`/customer/templates/media/${reply.media_key}`)
              : null,
            filename: reply.media_filename,
          }
        : null,
    };
  }
  if (reply.type === "list") {
    return {
      template: {
        header: { format: reply.header ? "text" : "none", text: reply.header ?? null },
        body: reply.text ?? "",
        footer: reply.footer ?? null,
        buttons: [],
      },
      media: null,
    };
  }
  return previewOf({ ...reply, type: reply.type } as Parameters<typeof previewOf>[0]);
}

function Mine({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="relative max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2 pt-1.5 pb-1 text-[13.5px] leading-[1.4] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] dark:bg-[#005c4b] dark:text-[#e9edef]">
        <p className="break-words whitespace-pre-wrap">{children}</p>
        <p className="-mt-0.5 flex items-center justify-end gap-0.5 text-[11px] text-[#667781] dark:text-[#8696a0]">
          now <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-hidden />
        </p>
      </div>
    </div>
  );
}

export function TestChat({
  botId,
  businessName,
  firstKeyword,
  getGraph,
  settings,
  onStep,
  onClose,
}: {
  botId: number;
  businessName: string;
  firstKeyword: string | null;
  getGraph: () => BotGraph;
  settings: BotSettings;
  onStep: (nodeId: string | null, trail: SimState["trail"]) => void;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<SimState | null>(null);
  const [waiting, setWaiting] = useState<SimResult["waiting"]>(null);
  const [vars, setVars] = useState<SimResult["contact"] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SimReply | null>(null);
  const [name, setName] = useState("Asha Verma");
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const push = (line: NewLine) => setLines((l) => [...l, { ...line, id: ++seq.current } as Line]);

  const play = async (events: SimEvent[]) => {
    for (const e of events) {
      if (!alive.current) return;
      if (e.kind === "message") {
        push({ from: "typing" });
        await new Promise((r) => setTimeout(r, 450));
        setLines((l) => l.filter((x) => x.from !== "typing"));
        push({ from: "bot", reply: e.reply, node: e.node_id });
      } else if (e.kind === "delay") {
        push({
          from: "note",
          kind: "note",
          text: `Waits ${e.seconds < 60 ? `${e.seconds} sec` : `${Math.round(e.seconds / 60)} min`}`,
        });
        push({ from: "typing" });
        await new Promise((r) => setTimeout(r, Math.min(e.seconds, 2) * 600));
        setLines((l) => l.filter((x) => x.from !== "typing"));
      } else {
        push({ from: "note", kind: e.kind, text: e.text });
      }
    }
  };

  const step = useCallback(
    async (input: { text?: string; reply_id?: string; media?: boolean } | null, current: SimState | null) => {
      setBusy(true);
      try {
        const res = await chatbotsApi.simulate(botId, {
          graph: getGraph(),
          settings,
          state: current,
          input,
          contact: {
            name,
            phone: "919800000000",
            tags: vars?.tags ?? [],
            attributes: vars?.attributes ?? {},
          },
        });
        const data = res.data;
        setState(data.state);
        setWaiting(data.waiting);
        setVars(data.contact);
        onStep(data.state.status === "active" ? data.state.node_id : null, data.state.trail);
        await play(data.events);
      } catch (err) {
        push({ from: "note", kind: "error", text: errorMessage(err) });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [botId, getGraph, settings, name, vars]
  );

  const restart = useCallback(() => {
    setLines([]);
    setState(null);
    setWaiting(null);
    setVars(null);
    setSheet(null);
    if (firstKeyword) push({ from: "me", text: firstKeyword });
    void step(firstKeyword ? { text: firstKeyword } : null, null);
  }, [firstKeyword, step]);

  useEffect(() => {
    // starts once when the panel opens
    const t = setTimeout(restart, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (input: { text?: string; reply_id?: string; media?: boolean }, shown: string) => {
    if (busy) return;
    push({ from: "me", text: shown });
    setSheet(null);
    const fresh = !state || state.status !== "active";
    void step(input, fresh ? null : state);
  };

  const lastBot = [...lines].reverse().find((l) => l.from === "bot") as
    Extract<Line, { from: "bot" }> | undefined;
  const ended = state?.status === "ended";

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Test chat">
      <div className="border-line flex items-center gap-2 border-b px-4 py-3">
        <Play className="text-primary h-4.5 w-4.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-fg text-sm font-semibold">Test your chatbot</p>
          <p className="text-fg-subtle truncate text-xs">
            Uses what&apos;s on the canvas now. Nothing is sent.
          </p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={RotateCcw} onClick={restart}>
          Restart
        </Button>
        <Button variant="ghost" iconOnly leftIcon={X} aria-label="Close test" onClick={onClose} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 bg-[#008069] px-3 py-2 text-white dark:bg-[#202c33]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-semibold">
            {(businessName.trim()[0] ?? "B").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1 text-[14px] font-semibold">
              <span className="truncate">{businessName || "Your business"}</span>
              <BadgeCheck
                className="h-4 w-4 shrink-0 fill-[#25d366] text-[#008069] dark:text-[#202c33]"
                aria-hidden
              />
            </span>
            <span className="block truncate text-[11px] opacity-80">{busy ? "typing…" : "online"}</span>
          </span>
        </div>

        <div ref={scroller} className={cn("relative min-h-0 flex-1 overflow-y-auto px-3 py-3 pl-5", CHAT_BG)}>
          <div className="flex flex-col gap-1.5" role="log" aria-label="Test messages">
            {lines.map((line) => {
              if (line.from === "me") return <Mine key={line.id}>{line.text}</Mine>;
              if (line.from === "typing")
                return (
                  <div
                    key={line.id}
                    className="w-14 rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-xs dark:bg-[#202c33]"
                  >
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8696a0]"
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                      ))}
                    </span>
                  </div>
                );
              if (line.from === "note") {
                const Icon = NOTE_ICONS[line.kind] ?? Check;
                return (
                  <p
                    key={line.id}
                    className={cn(
                      "mx-auto my-0.5 flex max-w-[92%] items-center gap-1.5 rounded-md px-2.5 py-1 text-center text-[11.5px] shadow-xs",
                      line.kind === "error"
                        ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : "bg-white/90 text-[#54656f] dark:bg-[#182229] dark:text-[#8696a0]"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {line.text}
                  </p>
                );
              }
              const current = line.id === lastBot?.id && !ended && !!waiting;
              const r = line.reply;
              return (
                <div key={line.id} className="max-w-[290px]">
                  <TemplateBubble {...bubbleOf(r)} time="now" highlight={false} />
                  {r.type === "buttons" && (
                    <div className="mt-1 space-y-1">
                      {(r.choices ?? []).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!current || busy}
                          onClick={() => send({ reply_id: c.id }, c.title)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[13.5px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] transition enabled:hover:bg-[#f5f6f6] disabled:opacity-60 dark:bg-[#202c33] dark:text-[#53bdeb]"
                        >
                          <Reply className="h-4 w-4" aria-hidden />
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.type === "list" && (
                    <button
                      type="button"
                      disabled={!current || busy}
                      onClick={() => setSheet(r)}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[13.5px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] disabled:opacity-60 dark:bg-[#202c33] dark:text-[#53bdeb]"
                    >
                      <ListIcon className="h-4 w-4" aria-hidden />
                      {r.list_button || "Options"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {ended && (
            <div className="mt-3 flex justify-center">
              <Button size="sm" leftIcon={RotateCcw} onClick={restart}>
                Test again
              </Button>
            </div>
          )}
          {sheet && (
            <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={() => setSheet(null)}>
              <div
                className="max-h-[80%] w-full overflow-y-auto rounded-t-2xl bg-white pb-2 text-[#111b21] shadow-lg dark:bg-[#233138] dark:text-[#e9edef]"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={sheet.list_button ?? "Options"}
              >
                <div className="flex items-center justify-between px-4 py-3 text-[14px] font-semibold">
                  {sheet.list_button || "Options"}
                  <button
                    type="button"
                    onClick={() => setSheet(null)}
                    aria-label="Close list"
                    className="opacity-60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {(sheet.sections ?? []).map((s, i) => (
                  <div key={i}>
                    {s.title && (
                      <p className="px-4 pt-2 pb-1 text-[12px] font-semibold text-[#008069] dark:text-[#00a884]">
                        {s.title}
                      </p>
                    )}
                    {s.rows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => send({ reply_id: row.id }, row.title)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px]">{row.title}</span>
                          {row.description && (
                            <span className="block text-[12px] text-[#667781] dark:text-[#8696a0]">
                              {row.description}
                            </span>
                          )}
                        </span>
                        <span
                          className="h-4.5 w-4.5 shrink-0 rounded-full border-2 border-[#8696a0]"
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-1.5 bg-[#f0f2f5] px-2 py-2 dark:bg-[#202c33]"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t) return;
            setText("");
            send({ text: t }, t);
          }}
        >
          <span className="flex h-10 flex-1 items-center gap-2 rounded-full bg-white px-3 dark:bg-[#2a3942]">
            <input
              name="test_message"
              aria-label="Your message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                ended
                  ? "Type to start again"
                  : waiting?.kind
                    ? PLACEHOLDER[waiting.kind]
                    : waiting
                      ? "Tap an option or type"
                      : "Message"
              }
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#111b21] outline-none placeholder:text-[#8696a0] dark:text-[#e9edef]"
            />
            <button
              type="button"
              onClick={() => send({ media: true, text: "" }, "📷 Photo")}
              className={cn(
                "text-[#54656f] dark:text-[#8696a0]",
                waiting?.kind === "media" && "text-[#008069]"
              )}
              aria-label="Send a photo"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </span>
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Send"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#008069] text-white disabled:opacity-60 dark:bg-[#00a884]"
          >
            <SendHorizontal className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>

      <details className="border-line border-t px-4 py-2.5 text-xs">
        <summary className="text-fg-subtle cursor-pointer font-medium select-none">Test data</summary>
        <div className="mt-2 space-y-2">
          <Input
            name="test_name"
            label="Test as"
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint="The name {{first_name}} and {{name}} use. Restart to apply."
          />
          <dl className="text-fg-subtle grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            {Object.entries(state?.variables ?? {}).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono">{`{{${k}}}`}</dt>
                <dd className="text-fg truncate">{String(v)}</dd>
              </div>
            ))}
            {vars?.tags.length ? (
              <div className="contents">
                <dt>Tags</dt>
                <dd className="text-fg truncate">{vars.tags.join(", ")}</dd>
              </div>
            ) : null}
            {Object.entries(vars?.attributes ?? {}).map(([k, v]) => (
              <div key={`a-${k}`} className="contents">
                <dt>{k}</dt>
                <dd className="text-fg truncate">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
