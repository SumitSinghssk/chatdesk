"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

import { useBaseUrl, withBase } from "./Inline";

// A small highlighter: enough colour to read code at a glance, no library needed.

const KEYWORDS: Record<string, string[]> = {
  js: [
    "const",
    "let",
    "var",
    "await",
    "async",
    "function",
    "return",
    "if",
    "import",
    "from",
    "new",
    "export",
    "else",
    "true",
    "false",
    "null",
  ],
  python: [
    "import",
    "from",
    "def",
    "return",
    "if",
    "not",
    "and",
    "or",
    "print",
    "True",
    "False",
    "None",
    "abort",
    "with",
    "as",
  ],
  php: ["function", "return", "if", "exit", "echo", "true", "false", "null", "array", "new"],
  bash: ["curl"],
};

const RULES: Record<string, RegExp> = {
  json: /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g,
  bash: /(#[^\n]*)|('(?:[^'])*'|"(?:\\.|[^"\\])*")|(\s-{1,2}[A-Za-z][\w-]*)|\b(curl)\b/g,
  http: /^([\w-]+)(?=:)/gm,
  code: /(\/\/[^\n]*|#(?!\[)[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(\b\d+(?:\.\d+)?\b)|\b([A-Za-z_]\w*)\b/g,
};

const C = {
  comment: "text-slate-500 italic",
  string: "text-emerald-300",
  key: "text-sky-300",
  number: "text-amber-300",
  keyword: "text-violet-300",
  flag: "text-sky-300",
};

function highlight(code: string, lang: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  const push = (text: string, cls?: string) =>
    out.push(
      cls ? (
        <span key={out.length} className={cls}>
          {text}
        </span>
      ) : (
        text
      )
    );
  const kind = lang === "json" || lang === "bash" || lang === "http" ? lang : "code";
  const keywords = new Set(KEYWORDS[lang] ?? []);
  const re = new RegExp(RULES[kind].source, RULES[kind].flags);
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m.index > last) push(code.slice(last, m.index));
    const [all, a, b, c, d] = m;
    if (kind === "json") push(all, a ? C.key : b ? C.string : c ? C.number : C.keyword);
    else if (kind === "bash") push(all, a ? C.comment : b ? C.string : c ? C.flag : C.keyword);
    else if (kind === "http") push(all, C.key);
    else if (a) push(all, C.comment);
    else if (b) push(all, C.string);
    else if (c) push(all, C.number);
    else push(all, d && keywords.has(d) ? C.keyword : undefined);
    last = m.index + all.length;
  }
  if (last < code.length) push(code.slice(last));
  return out;
}

export function CopyCode({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white",
        className
      )}
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Frame({
  head,
  text,
  lang,
  className,
}: {
  head: ReactNode;
  text: string;
  lang: string;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-xl border border-slate-800 bg-[#0d1117] shadow-sm", className)}
    >
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-white/10 pr-1.5 pl-3">
        {head}
        <CopyCode text={text} />
      </div>
      <pre className="max-h-[440px] overflow-auto p-3.5 font-mono text-[12.5px] leading-[1.7] text-slate-200">
        <code>{highlight(text, lang)}</code>
      </pre>
    </div>
  );
}

const LANG_LABEL: Record<string, string> = {
  bash: "Terminal",
  js: "JavaScript",
  python: "Python",
  php: "PHP",
  json: "JSON",
  http: "HTTP",
  text: "Text",
};

export function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  const text = withBase(code, useBaseUrl());
  return (
    <Frame
      text={text}
      lang={lang}
      head={
        <span className="text-[11px] font-medium text-slate-400">{title ?? LANG_LABEL[lang] ?? lang}</span>
      }
    />
  );
}

const PREF_KEY = "cd_docs_lang";
const PREF_EVENT = "cd-docs-lang";

function subscribeLang(cb: () => void) {
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREF_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function readLang() {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

/** Code in several languages; the reader's choice is remembered and every block on the page follows it. */
export function CodeTabs({ samples }: { samples: { label: string; lang: string; code: string }[] }) {
  const base = useBaseUrl();
  const picked = useSyncExternalStore(subscribeLang, readLang, () => null);
  const current = samples.find((s) => s.label === picked || s.label.startsWith(`${picked} `)) ?? samples[0];
  const choose = (label: string) => {
    try {
      localStorage.setItem(PREF_KEY, label);
    } catch {}
    window.dispatchEvent(new Event(PREF_EVENT));
  };
  const text = withBase(current.code, base);
  return (
    <Frame
      text={text}
      lang={current.lang}
      head={
        <div role="tablist" aria-label="Language" className="no-scrollbar -mb-px flex overflow-x-auto">
          {samples.map((s) => (
            <button
              key={s.label}
              type="button"
              role="tab"
              aria-selected={s === current}
              onClick={() => choose(s.label)}
              className={cn(
                "border-b-2 px-2.5 py-2 text-[11px] font-medium whitespace-nowrap transition",
                s === current
                  ? "border-emerald-400 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    />
  );
}

export function JsonBlock({ value, title, status }: { value: unknown; title: string; status?: number }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <Frame
      text={text}
      lang="json"
      head={
        <span className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
          {status && (
            <span
              className={cn(
                "rounded px-1.5 py-px font-mono text-[10px] font-semibold",
                status < 300 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
              )}
            >
              {status}
            </span>
          )}
          {title}
        </span>
      }
    />
  );
}
