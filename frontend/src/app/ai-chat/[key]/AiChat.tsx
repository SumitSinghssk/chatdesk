"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { MessageCircle, SendHorizontal, ThumbsDown, ThumbsUp, UserRoundCheck, X } from "lucide-react";

import { BROWSER_API_BASE_URL } from "@/config/site";
import { ChatText } from "@/lib/chatText";
import { readStream } from "@/lib/sse";

interface Config {
  name: string;
  business_name: string;
  title: string;
  subtitle: string;
  greeting: string;
  color: string;
  position: "right" | "left";
  theme: "auto" | "light" | "dark";
  launcher_text: string;
  suggestions: string[];
  lead: "off" | "optional" | "required";
  lead_fields: ("name" | "phone" | "email")[];
  whatsapp_url: string | null;
  branding: boolean;
  online: boolean;
}

type Msg = {
  key: string;
  id?: number;
  role: "user" | "assistant" | "error";
  text: string;
  streaming?: boolean;
  outcome?: string | null;
  feedback?: "up" | "down" | null;
};

const LIGHT = {
  "--w-bg": "#ffffff",
  "--w-panel": "#f6f7f9",
  "--w-fg": "#0f172a",
  "--w-muted": "#64748b",
  "--w-line": "#e2e8f0",
  "--w-bubble": "#ffffff",
};
const DARK = {
  "--w-bg": "#111827",
  "--w-panel": "#0b1220",
  "--w-fg": "#e5e7eb",
  "--w-muted": "#9ca3af",
  "--w-line": "#1f2937",
  "--w-bubble": "#1f2937",
};

function readable(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#0f172a" : "#ffffff";
}

function usePrefersDark() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-color-scheme: dark)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  );
}

const store = {
  get(key: string): { token?: string; lead?: boolean } {
    try {
      return JSON.parse(localStorage.getItem(`chatdesk-ai:${key}`) || "{}");
    } catch {
      return {};
    }
  },
  set(key: string, value: { token?: string; lead?: boolean }) {
    try {
      localStorage.setItem(`chatdesk-ai:${key}`, JSON.stringify({ ...store.get(key), ...value }));
    } catch {
      /* private mode: the chat still works, it just won't remember this visitor */
    }
  },
};

export function AiChat({
  agentKey,
  embed,
  host,
  page,
}: {
  agentKey: string;
  embed: boolean;
  host: string | null;
  page: string | null;
}) {
  const api = `${BROWSER_API_BASE_URL}/website/ai/${encodeURIComponent(agentKey)}`;
  const hostQ = host ? `host=${encodeURIComponent(host)}` : "";
  const [cfg, setCfg] = useState<Config | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(!embed);
  const [full, setFull] = useState(false); // the page around us is a phone: the chat takes the whole screen
  const [messages, setMessages] = useState<Msg[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [leadDone, setLeadDone] = useState(false);
  const [lead, setLead] = useState({ name: "", phone: "", email: "" });
  const [leadError, setLeadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [handover, setHandover] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const seq = useRef(0);
  const prefersDark = usePrefersDark();

  // load the look, then this visitor's earlier conversation
  useEffect(() => {
    let alive = true;
    const saved = store.get(agentKey);
    fetch(`${api}/config?${hostQ}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.message || "This chat isn't available.");
        return body.data as Config;
      })
      .then(async (c) => {
        if (!alive) return;
        setCfg(c);
        if (saved.lead) setLeadDone(true);
        if (!saved.token) return;
        setToken(saved.token);
        const r = await fetch(`${api}/thread?token=${encodeURIComponent(saved.token)}&${hostQ}`);
        const body = await r.json().catch(() => null);
        if (!alive || !r.ok || !body?.data) return;
        setHandover(!!body.data.handover);
        if (body.data.visitor && Object.keys(body.data.visitor).length) setLeadDone(true);
        setMessages(
          (
            body.data.items as {
              id: number;
              role: "user" | "assistant";
              text: string;
              outcome: string | null;
              feedback: "up" | "down" | null;
            }[]
          ).map((m) => ({
            key: `h${m.id}`,
            ...m,
          }))
        );
      })
      .catch((err: Error) => alive && setFailed(err.message));
    return () => {
      alive = false;
    };
  }, [api, hostQ, agentKey]);

  // tell the page around us how big to be
  useEffect(() => {
    if (!embed || typeof window === "undefined" || window.parent === window) return;
    if (failed) {
      window.parent.postMessage({ source: "chatdesk-ai", type: "hide" }, "*");
      return;
    }
    if (!cfg) return;
    window.parent.postMessage(
      {
        source: "chatdesk-ai",
        type: "state",
        open,
        position: cfg.position,
        launcher: launcher.current?.offsetWidth ?? 64,
      },
      "*"
    );
  }, [embed, open, cfg, failed]);

  useEffect(() => {
    if (!embed) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.source !== "chatdesk-host") return;
      if (e.data.type === "open") setOpen(true);
      if (e.data.type === "close") setOpen(false);
      if (e.data.type === "layout") setFull(!!e.data.full);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embed]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const remember = useCallback(
    (t: string) => {
      setToken(t);
      store.set(agentKey, { token: t });
    },
    [agentKey]
  );

  const needsLead = !!cfg && cfg.lead !== "off" && !leadDone;
  const blocked = needsLead && cfg?.lead === "required";

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy || !cfg) return;
    if (blocked) return;
    setText("");
    setBusy(true);
    const id = String((seq.current += 1));
    setMessages((m) => [
      ...m,
      { key: `u${id}`, role: "user", text: q },
      { key: `a${id}`, role: "assistant", text: "", streaming: true },
    ]);
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((all) => all.map((m) => (m.key === `a${id}` ? fn(m) : m)));
    try {
      const res = await fetch(`${api}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message: q, token, host, page }),
      });
      await readStream<{ id: number; text: string; outcome: string; handover: boolean }>(res, {
        onThread: (t) => t.token && remember(t.token),
        onDelta: (piece) => patch((m) => ({ ...m, text: m.text + piece })),
        onDone: (d) => {
          patch((m) => ({ ...m, id: d.id, text: d.text, outcome: d.outcome, streaming: false }));
          if (d.handover) setHandover(true);
        },
        onError: (e) => patch((m) => ({ ...m, role: "error", text: e.message, streaming: false })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't send. Please try again.";
      patch((m) => ({ ...m, role: "error", text: message, streaming: false }));
      if (/details first/i.test(message)) setLeadDone(false);
    } finally {
      setBusy(false);
    }
  };

  const submitLead = async (skip = false) => {
    if (skip) {
      setLeadDone(true);
      store.set(agentKey, { lead: true });
      return;
    }
    setLeadError(null);
    const res = await fetch(`${api}/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        host,
        ...Object.fromEntries(Object.entries(lead).filter(([, v]) => v.trim())),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLeadError(body.message || "Please check your details.");
      return;
    }
    remember(body.data.token);
    store.set(agentKey, { lead: true });
    setLeadDone(true);
  };

  const rate = async (m: Msg, value: "up" | "down") => {
    if (!m.id || !token) return;
    const next = m.feedback === value ? null : value;
    setMessages((all) => all.map((x) => (x.key === m.key ? { ...x, feedback: next } : x)));
    await fetch(`${api}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, message_id: m.id, value: next }),
    }).catch(() => null);
  };

  if (failed) {
    return embed ? null : (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-500">
        {failed}
      </main>
    );
  }
  if (!cfg) {
    return embed ? null : <main className="min-h-dvh bg-slate-50" />;
  }

  const dark = cfg.theme === "dark" || (cfg.theme === "auto" && prefersDark);
  const vars = {
    ...(dark ? DARK : LIGHT),
    "--w-brand": cfg.color,
    "--w-on-brand": readable(cfg.color),
  } as CSSProperties;
  const left = cfg.position === "left";
  const started = messages.some((m) => m.role === "user");

  const panel = (
    <section
      aria-label={cfg.title}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--w-bg)] text-[var(--w-fg)]"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <header
        className="flex items-center gap-3 px-4 py-3.5"
        style={{ background: "var(--w-brand)", color: "var(--w-on-brand)" }}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-base font-semibold">
          {(cfg.name || "A").slice(0, 1).toUpperCase()}
          <span
            className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-white/70 ${cfg.online ? "bg-emerald-400" : "bg-slate-400"}`}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-semibold">{cfg.title}</span>
          <span className="block truncate text-xs opacity-85">
            {cfg.online ? cfg.subtitle : "We're away right now"}
          </span>
        </span>
        {embed && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="rounded-full p-1.5 transition hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-[var(--w-panel)] px-3.5 py-4"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        <Bubble role="assistant" text={cfg.greeting} />
        {!started && cfg.suggestions.length > 0 && !blocked && (
          <div className="flex flex-wrap gap-1.5 pl-1">
            {cfg.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={!cfg.online}
                className="rounded-full border bg-[var(--w-bg)] px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                style={{ borderColor: "var(--w-brand)", color: "var(--w-brand)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.key}>
            <Bubble role={m.role} text={m.text} streaming={m.streaming} />
            {m.role === "assistant" && m.id && !m.streaming && (
              <div className="mt-0.5 flex gap-0.5 pl-1 text-[var(--w-muted)]">
                <button
                  type="button"
                  aria-label="Helpful"
                  aria-pressed={m.feedback === "up"}
                  onClick={() => rate(m, "up")}
                  className="rounded p-1 hover:bg-black/5"
                  style={m.feedback === "up" ? { color: "var(--w-brand)" } : undefined}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Not helpful"
                  aria-pressed={m.feedback === "down"}
                  onClick={() => rate(m, "down")}
                  className="rounded p-1 hover:bg-black/5"
                  style={m.feedback === "down" ? { color: "#dc2626" } : undefined}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {handover && (
          <p className="flex items-start gap-2 rounded-xl border border-[var(--w-line)] bg-[var(--w-bg)] px-3 py-2 text-xs text-[var(--w-muted)]">
            <UserRoundCheck
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: "var(--w-brand)" }}
              aria-hidden
            />
            Our team has been told and will reply soon
            {cfg.whatsapp_url ? ", or reach us faster on WhatsApp." : "."}
          </p>
        )}
        {needsLead && (
          <form
            className="space-y-2 rounded-2xl border border-[var(--w-line)] bg-[var(--w-bg)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitLead();
            }}
            aria-label="Your details"
          >
            <p className="text-sm font-medium">
              {cfg.lead === "required"
                ? "Please share your details to start"
                : "Share your details so we can follow up (optional)"}
            </p>
            {cfg.lead_fields.map((f) => (
              <input
                key={f}
                aria-label={f === "name" ? "Your name" : f === "phone" ? "Phone number" : "Email"}
                placeholder={f === "name" ? "Your name" : f === "phone" ? "Phone number" : "Email"}
                type={f === "email" ? "email" : f === "phone" ? "tel" : "text"}
                value={lead[f]}
                onChange={(e) => setLead((l) => ({ ...l, [f]: e.target.value }))}
                required={cfg.lead === "required" && f !== "email"}
                className="w-full rounded-lg border border-[var(--w-line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--w-brand)]"
              />
            ))}
            {leadError && (
              <p role="alert" className="text-xs text-red-600">
                {leadError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
                style={{ background: "var(--w-brand)", color: "var(--w-on-brand)" }}
              >
                Start chat
              </button>
              {cfg.lead === "optional" && (
                <button
                  type="button"
                  onClick={() => submitLead(true)}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--w-muted)] hover:bg-black/5"
                >
                  Skip
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-[var(--w-line)] bg-[var(--w-bg)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          rows={1}
          value={text}
          disabled={blocked || !cfg.online}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder={cfg.online ? "Type your message…" : "Chat is unavailable right now"}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-[var(--w-line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--w-brand)] disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim() || busy || blocked}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40"
          style={{ background: "var(--w-brand)", color: "var(--w-on-brand)" }}
        >
          <SendHorizontal className="h-4.5 w-4.5" />
        </button>
      </form>
      {(cfg.whatsapp_url || cfg.branding) && (
        <div className="flex items-center justify-center gap-3 bg-[var(--w-bg)] pb-2 text-[11px] text-[var(--w-muted)]">
          {cfg.whatsapp_url && (
            <a
              href={cfg.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#128c7e] hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Continue on WhatsApp
            </a>
          )}
          {cfg.branding && <span>Powered by ChatDesk</span>}
        </div>
      )}
    </section>
  );

  if (!embed) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center p-0 sm:p-6"
        style={{
          ...vars,
          background: dark ? "#030712" : `linear-gradient(160deg, ${cfg.color}22, #f1f5f9 55%)`,
        }}
      >
        <style>{"html,body{background:transparent}"}</style>
        <div className="h-dvh w-full overflow-hidden sm:h-[min(760px,92dvh)] sm:max-w-md sm:rounded-3xl sm:shadow-2xl">
          {panel}
        </div>
      </main>
    );
  }

  return (
    <div style={vars} className="h-dvh w-full">
      <style>{"html,body{background:transparent!important;overflow:hidden}"}</style>
      {open ? (
        <div className={full ? "h-full w-full" : "h-full w-full p-3 pt-4"}>
          <div
            className={
              full
                ? "h-full w-full overflow-hidden"
                : "h-full w-full overflow-hidden rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.22)]"
            }
          >
            {panel}
          </div>
        </div>
      ) : (
        <button
          ref={launcher}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={cfg.launcher_text || `Chat with ${cfg.name}`}
          className={`absolute bottom-5 flex h-14 min-w-14 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition hover:scale-105 ${left ? "left-5" : "right-5"}`}
          style={{ background: "var(--w-brand)", color: "var(--w-on-brand)" }}
        >
          <MessageCircle className="h-6 w-6" aria-hidden />
          {cfg.launcher_text}
        </button>
      )}
    </div>
  );
}

function Bubble({ role, text, streaming }: { role: Msg["role"]; text: string; streaming?: boolean }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <p
          className="max-w-[82%] rounded-2xl rounded-br-md px-3 py-2 text-sm break-words whitespace-pre-wrap"
          style={{ background: "var(--w-brand)", color: "var(--w-on-brand)" }}
        >
          {text}
        </p>
      </div>
    );
  }
  if (role === "error") {
    return (
      <p role="alert" className="max-w-[88%] rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
        {text}
      </p>
    );
  }
  return (
    <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-[var(--w-line)] bg-[var(--w-bubble)] px-3 py-2 text-sm break-words shadow-[0_1px_1px_rgba(0,0,0,0.04)]">
      {text ? (
        <ChatText text={text} linkClassName="underline underline-offset-2 text-[var(--w-brand)]" />
      ) : (
        <span className="flex gap-1 py-1" aria-label="Typing">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--w-muted)]"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
      )}
      {streaming && text && (
        <span
          className="ml-0.5 inline-block h-3.5 w-1 animate-pulse align-middle"
          style={{ background: "var(--w-brand)" }}
          aria-hidden
        />
      )}
    </div>
  );
}
