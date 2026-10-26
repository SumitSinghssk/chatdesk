"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, FileText, Link2 } from "lucide-react";

import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { cn } from "@/lib/utils";

import { href, neighbours, pageBySlug, toc, type TocItem } from "../_content";
import { toMarkdown } from "../_content/markdown";
import { SECTIONS } from "../_content/types";
import { Blocks } from "./Blocks";
import { MethodBadge } from "./Endpoint";
import { Inline, useBaseUrl } from "./Inline";

function OnThisPage({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-120px 0px -65% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-[12.5px]">
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={cn(
                "block border-l-2 py-1 leading-[1.45] transition",
                i.level === 3 ? "pl-5" : "pl-3",
                active === i.id
                  ? "border-fg text-fg"
                  : "border-line text-fg-subtle hover:text-fg hover:border-line-strong"
              )}
            >
              {i.text.replace(/`/g, "")}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Copy Page" and its menu: the page as Markdown, or its link. */
function CopyPage({ slug }: { slug: string }) {
  const base = useBaseUrl();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const copy = async (what: "markdown" | "link") => {
    const text =
      what === "markdown" ? toMarkdown(pageBySlug(slug)!, base) : window.location.href.split("#")[0];
    await navigator.clipboard?.writeText(text).catch(() => null);
    setOpen(false);
    setDone(what);
    setTimeout(() => setDone(null), 1600);
  };
  const button =
    "text-fg hover:bg-hover inline-flex h-8 items-center gap-1.5 text-[13px] font-semibold transition";
  return (
    <div ref={ref} className="border-line relative flex shrink-0 rounded-lg border shadow-xs">
      <button type="button" onClick={() => copy("markdown")} className={cn(button, "rounded-l-lg px-2.5")}>
        {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {done === "link" ? "Link copied" : done ? "Copied" : "Copy Page"}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More copy options"
        aria-expanded={open}
        className={cn(button, "border-line rounded-r-lg border-l px-2")}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="border-line bg-surface absolute top-full right-0 z-30 mt-1.5 w-64 rounded-xl border p-1.5 shadow-xl">
          <button
            type="button"
            onClick={() => copy("markdown")}
            className="hover:bg-hover flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left"
          >
            <FileText className="text-fg-subtle mt-0.5 h-4 w-4" />
            <span>
              <span className="text-fg block text-[13px] font-medium">Copy page as Markdown</span>
              <span className="text-fg-subtle block text-xs">For notes or an AI assistant</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => copy("link")}
            className="hover:bg-hover flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left"
          >
            <Link2 className="text-fg-subtle mt-0.5 h-4 w-4" />
            <span>
              <span className="text-fg block text-[13px] font-medium">Copy link to this page</span>
              <span className="text-fg-subtle block text-xs">To share it with your team</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export function DocArticle({ slug }: { slug: string }) {
  const page = pageBySlug(slug)!;
  const { prev, next } = neighbours(slug);
  const items = toc(page);
  const section = SECTIONS.find((s) => s.key === page.section)?.label;

  // headings are rendered on the client: jump to #anchor once they exist
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [slug]);

  return (
    <div className="flex">
      <article className="min-w-0 flex-1 px-4 pt-7 pb-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[740px]">
          <div className="flex items-start justify-between gap-4">
            <p className="text-fg-subtle pt-1.5 text-xs font-medium">{section}</p>
            <CopyPage slug={slug} />
          </div>
          <h1 className="text-fg mt-3 flex flex-wrap items-center gap-3 text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">
            {page.method && <MethodBadge method={page.method} className="text-xs" />}
            {page.title}
          </h1>
          <p className="text-fg-muted mt-3 text-[16.5px] leading-8">
            <Inline text={page.description} />
          </p>
          <hr className="border-line mt-7 mb-8" />
          <Blocks blocks={page.blocks} />

          <div className="border-line mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
            {prev ? (
              <Link
                href={href(prev.slug)}
                className="border-line hover:border-fg-faint group rounded-xl border p-4 transition"
              >
                <span className="text-fg-subtle flex items-center gap-1 text-xs">
                  <ArrowLeft className="h-3.5 w-3.5" /> Previous
                </span>
                <span className="text-fg mt-1 block text-sm font-semibold">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={href(next.slug)}
                className="border-line hover:border-fg-faint group rounded-xl border p-4 text-right transition"
              >
                <span className="text-fg-subtle flex items-center justify-end gap-1 text-xs">
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </span>
                <span className="text-fg mt-1 block text-sm font-semibold">{next.title}</span>
              </Link>
            )}
          </div>
        </div>
      </article>
      <aside className="sticky top-[6.25rem] hidden h-[calc(100dvh-6.25rem)] w-64 shrink-0 overflow-y-auto py-9 pr-6 pl-2 xl:block">
        <OnThisPage items={items} />
      </aside>
    </div>
  );
}
