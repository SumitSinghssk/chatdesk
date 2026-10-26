"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, CornerDownLeft, FileText, Hash, Search as SearchIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { href, searchIndex, type SearchEntry } from "../_content";
import { SECTIONS, type Method, type Section } from "../_content/types";
import { MethodBadge } from "./Endpoint";

const INDEX = searchIndex();
const METHODS: Method[] = ["GET", "POST", "PATCH", "DELETE"];
const RECENT_KEY = "cd_docs_recent";
const POPULAR = [
  { label: "Quickstart", to: "/docs/quickstart" },
  { label: "Send a template message", to: "/docs/api/send-template" },
  { label: "The 24-hour rule", to: "/docs/basics#the-24-hour-rule" },
  { label: "Event types", to: "/docs/webhooks/events" },
  { label: "Verify signatures", to: "/docs/webhooks/verify-signatures" },
];

interface Hit {
  entry: SearchEntry;
  score: number;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9._/{}-]+/)
    .filter(Boolean);

/** Edit distance up to 1 (a typo: one letter missing, extra, or wrong). */
function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function parse(raw: string) {
  let section: Section | null = null;
  let method: Method | null = null;
  const terms: string[] = [];
  for (const part of raw.trim().split(/\s+/).filter(Boolean)) {
    const [k, v] = part.toLowerCase().split(":");
    if (k === "in" && v) {
      const hit = SECTIONS.find((s) => s.key === v || s.label.toLowerCase().startsWith(v));
      if (hit) section = hit.key;
      continue;
    }
    if (k === "method" && v && METHODS.includes(v.toUpperCase() as Method)) {
      method = v.toUpperCase() as Method;
      continue;
    }
    terms.push(...words(part));
  }
  return { section, method, terms };
}

function score(e: SearchEntry, terms: string[], phrase: string, all: boolean): number {
  const title = e.page.toLowerCase();
  const heading = (e.heading ?? "").toLowerCase();
  const path = (e.path ?? "").toLowerCase();
  const text = e.text.toLowerCase();
  const textWords = new Set(words(e.text));
  let total = 0;
  let matched = 0;
  for (const t of terms) {
    let s = 0;
    if (title.includes(t)) s += words(title).some((w) => w.startsWith(t)) ? 8 : 5;
    if (heading.includes(t)) s += 6;
    if (path.includes(t)) s += 6;
    if (text.includes(t)) s += 2;
    if (!s && t.length >= 4) {
      // a typo: count it, but a near match in a title still beats one buried in the text
      if (words(title).some((w) => near(t, w))) s += 4;
      else if (words(heading).some((w) => near(t, w))) s += 3;
      else if ([...textWords].some((w) => near(t, w))) s += 1;
    }
    if (s) matched++;
    total += s;
  }
  if (all ? matched < terms.length : !matched) return 0;
  if (phrase.length > 3 && (title.includes(phrase) || heading.includes(phrase) || text.includes(phrase)))
    total += 10;
  if (!e.anchor) total += 1; // the page itself before its sections
  return total;
}

function search(raw: string, sectionFilter: Section | null, methodFilter: Method | null) {
  const { section, method, terms } = parse(raw);
  const sec = section ?? sectionFilter;
  const meth = method ?? methodFilter;
  const pool = INDEX.filter((e) => (!sec || e.section === sec) && (!meth || e.method === meth));
  if (!terms.length)
    return {
      hits: pool.filter((e) => !e.anchor).map((entry) => ({ entry, score: 1 })),
      partial: false,
      terms,
    };
  const phrase = terms.join(" ");
  const run = (all: boolean) =>
    pool
      .map((entry) => ({ entry, score: score(entry, terms, phrase, all) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
  const strict = run(true);
  return strict.length ? { hits: strict, partial: false, terms } : { hits: run(false), partial: true, terms };
}

/** Results grouped by page, best pages first, up to 3 sections each. */
function group(hits: Hit[]) {
  const pages = new Map<string, Hit[]>();
  for (const h of hits) {
    const list = pages.get(h.entry.slug) ?? [];
    if (list.length < 4) list.push(h);
    pages.set(h.entry.slug, list);
  }
  return [...pages.values()].slice(0, 12);
}

function Highlight({ text, terms }: { text: string; terms: string[] }): ReactNode {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="text-fg rounded-[3px] bg-amber-300/40 px-px dark:bg-amber-400/25">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

function snippet(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), Infinity);
  if (!Number.isFinite(at)) return text.slice(0, 120);
  const start = Math.max(0, at - 50);
  return `${start ? "…" : ""}${text.slice(start, start + 140)}${start + 140 < text.length ? "…" : ""}`;
}

function readRecent(): { label: string; to: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<{ label: string; to: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- each opening starts fresh */
    setRecent(readRecent());
    setQuery("");
    setActive(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => input.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  const { hits, partial, terms } = useMemo(() => search(query, section, method), [query, section, method]);
  const groups = useMemo(() => group(hits), [hits]);
  const flat = groups.flat();
  const showResults = query.trim() || section || method;

  const go = (to: string, label: string) => {
    const next = [{ label, to }, ...readRecent().filter((r) => r.to !== to)].slice(0, 5);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    onClose();
    router.push(to);
  };
  const target = (h: Hit) => `${href(h.entry.slug)}${h.entry.anchor ? `#${h.entry.anchor}` : ""}`;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = flat.length;
      if (!n) return;
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      setActive(next);
      list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      const h = flat[active];
      go(target(h), h.entry.heading ?? h.entry.page);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;
  let index = -1;
  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-slate-950/50 p-3 pt-[8vh] backdrop-blur-[2px] sm:p-6 sm:pt-[10vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search the docs"
        className="border-line bg-surface flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="border-line flex shrink-0 items-center gap-2.5 border-b px-4">
          <SearchIcon className="text-fg-faint h-4 w-4 shrink-0" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search guides, endpoints, events, errors…"
            aria-label="Search"
            aria-controls="docs-search-results"
            className="text-fg placeholder:text-fg-faint h-13 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear"
              className="text-fg-faint hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="border-line text-fg-subtle hidden rounded border px-1.5 py-0.5 text-[10px] sm:block">
            Esc
          </kbd>
        </div>

        <div className="border-line no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-3 py-2">
          {[{ key: null, label: "All" }, ...SECTIONS].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setSection(s.key as Section | null);
                if (s.key !== "api") setMethod(null);
                setActive(0);
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap transition",
                section === s.key
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-fg-subtle hover:text-fg"
              )}
            >
              {s.label}
            </button>
          ))}
          {section === "api" && (
            <span className="border-line ml-1 flex gap-1 border-l pl-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(method === m ? null : m)}
                  aria-pressed={method === m}
                  className={cn("rounded-md transition", method && method !== m && "opacity-40")}
                >
                  <MethodBadge method={m} />
                </button>
              ))}
            </span>
          )}
        </div>

        <div
          ref={list}
          id="docs-search-results"
          className="min-h-0 flex-1 overflow-y-auto p-2"
          role="listbox"
        >
          {!showResults ? (
            <div className="space-y-4 p-2">
              {recent.length > 0 && (
                <div>
                  <p className="text-fg-subtle mb-1.5 px-1 text-[11px] font-semibold tracking-wide uppercase">
                    Recent
                  </p>
                  {recent.map((r) => (
                    <button
                      key={r.to}
                      type="button"
                      onClick={() => go(r.to, r.label)}
                      className="text-fg-muted hover:bg-hover hover:text-fg flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm"
                    >
                      <Clock className="text-fg-faint h-3.5 w-3.5" /> {r.label}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <p className="text-fg-subtle mb-1.5 px-1 text-[11px] font-semibold tracking-wide uppercase">
                  Popular
                </p>
                {POPULAR.map((r) => (
                  <button
                    key={r.to}
                    type="button"
                    onClick={() => go(r.to, r.label)}
                    className="text-fg-muted hover:bg-hover hover:text-fg flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm"
                  >
                    <ArrowRight className="text-fg-faint h-3.5 w-3.5" /> {r.label}
                  </button>
                ))}
              </div>
              <p className="text-fg-subtle px-1 text-xs leading-5">
                Tip: narrow it down with <code className="bg-page rounded px-1 font-mono">in:webhooks</code>{" "}
                or <code className="bg-page rounded px-1 font-mono">method:post</code>, e.g.{" "}
                <code className="bg-page rounded px-1 font-mono">contact method:patch</code>. Small typos are
                fine.
              </p>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-fg text-sm font-medium">No results for “{query}”</p>
              <p className="text-fg-subtle mt-1 text-xs">
                Try fewer or different words, or clear the filters.
              </p>
            </div>
          ) : (
            <>
              {partial && (
                <p className="text-fg-subtle px-2 pt-1 pb-2 text-xs">
                  No page has every word: showing the closest matches.
                </p>
              )}
              {groups.map((g) => (
                <div key={g[0].entry.slug} className="mb-2">
                  <p className="text-fg-subtle flex items-center gap-2 px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                    {SECTIONS.find((s) => s.key === g[0].entry.section)?.label} · {g[0].entry.page}
                  </p>
                  {g.map((h) => {
                    index++;
                    const i = index;
                    const isActive = i === active;
                    return (
                      <button
                        key={`${h.entry.slug}#${h.entry.anchor}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-index={i}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(target(h), h.entry.heading ?? h.entry.page)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition",
                          isActive ? "bg-primary-soft" : "hover:bg-hover"
                        )}
                      >
                        {h.entry.anchor ? (
                          <Hash className="text-fg-faint mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <FileText className="text-fg-faint mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-fg flex items-center gap-2 text-sm font-medium">
                            {!h.entry.anchor && h.entry.method && <MethodBadge method={h.entry.method} />}
                            <span className="truncate">
                              <Highlight text={h.entry.heading ?? h.entry.page} terms={terms} />
                            </span>
                          </span>
                          <span className="text-fg-subtle mt-0.5 line-clamp-2 block text-xs leading-5">
                            <Highlight text={snippet(h.entry.text, terms)} terms={terms} />
                          </span>
                        </span>
                        {isActive && <CornerDownLeft className="text-primary mt-1 h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="border-line text-fg-subtle hidden shrink-0 items-center gap-4 border-t px-4 py-2 text-[11px] sm:flex">
          <span>
            <kbd className="border-line rounded border px-1">↑</kbd>{" "}
            <kbd className="border-line rounded border px-1">↓</kbd> to move
          </span>
          <span>
            <kbd className="border-line rounded border px-1">↵</kbd> to open
          </span>
          <span className="ml-auto">{flat.length ? `${hits.length} matches` : ""}</span>
        </div>
      </div>
    </div>
  );
}
