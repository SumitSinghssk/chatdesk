"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Info,
  Lightbulb,
  Link2,
  OctagonAlert,
  Rocket,
  Send,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { headingId, slugify } from "../_content";
import type { Block, Param, Shot as ShotType } from "../_content/types";
import { EVENT_DOCS } from "../_content/webhooks";
import { CodeBlock, CodeTabs, JsonBlock } from "./Code";
import { Endpoint } from "./Endpoint";
import { Inline } from "./Inline";

function Anchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="Link to this section"
      className="text-fg-faint hover:text-primary ml-1.5 inline-flex align-middle opacity-0 transition group-hover:opacity-100 focus:opacity-100"
    >
      <Link2 className="h-3.5 w-3.5" />
    </a>
  );
}

const CALLOUT: Record<string, { icon: LucideIcon; box: string; icon_: string }> = {
  info: { icon: Info, box: "border-sky-500/25 bg-sky-500/[0.06]", icon_: "text-sky-600 dark:text-sky-400" },
  tip: {
    icon: Lightbulb,
    box: "border-emerald-500/25 bg-emerald-500/[0.06]",
    icon_: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    box: "border-amber-500/30 bg-amber-500/[0.07]",
    icon_: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    icon: OctagonAlert,
    box: "border-red-500/25 bg-red-500/[0.06]",
    icon_: "text-red-600 dark:text-red-400",
  },
};

const CARD_ICONS: Record<string, LucideIcon> = { rocket: Rocket, send: Send, webhook: Webhook, zap: Zap };

export function Shot({ shot }: { shot: ShotType }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);
  return (
    <figure className="my-1">
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="border-line bg-page block w-full cursor-zoom-in overflow-hidden rounded-xl border shadow-sm transition hover:shadow-md"
        aria-label={`Enlarge: ${shot.alt}`}
      >
        <Image
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          className="h-auto w-full"
          sizes="(min-width: 1024px) 720px, 100vw"
        />
      </button>
      {shot.caption && (
        <figcaption className="text-fg-subtle mt-2 text-center text-xs">{shot.caption}</figcaption>
      )}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={shot.alt}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            className="max-h-[90vh] w-auto max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}
    </figure>
  );
}

function Params({ title, rows }: { title: string; rows: Param[] }) {
  const id = slugify(title);
  return (
    <section>
      <h2 id={id} className="group text-fg mt-2 mb-2 scroll-mt-32 text-[17px] font-semibold">
        {title}
        <Anchor id={id} />
      </h2>
      <dl className="border-line divide-line divide-y border-y">
        {rows.map((r) => (
          <div key={r.name} className="py-3">
            <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <code className="text-fg font-mono text-[12.5px] font-semibold">{r.name}</code>
              <span className="text-fg-subtle font-mono text-[11px]">{r.type}</span>
              {r.required && (
                <span className="text-[10px] font-semibold tracking-wide text-red-600 uppercase dark:text-red-400">
                  Required
                </span>
              )}
            </dt>
            <dd className="text-fg-muted mt-1 text-[13.5px] leading-6">
              <Inline text={r.desc} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Events() {
  const [open, setOpen] = useState<string | null>(EVENT_DOCS[0].event);
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const hit = EVENT_DOCS.find((e) => slugify(e.event) === hash);
    if (hit) setOpen(hit.event); // eslint-disable-line react-hooks/set-state-in-effect -- open the linked event
  }, []);
  return (
    <div className="border-line divide-line divide-y overflow-hidden rounded-xl border">
      {EVENT_DOCS.map((e) => {
        const id = slugify(e.event);
        const isOpen = open === e.event;
        return (
          <section key={e.event} id={id} className="scroll-mt-32">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : e.event)}
              aria-expanded={isOpen}
              className="hover:bg-hover flex w-full items-start gap-3 px-4 py-3 text-left transition"
            >
              <ChevronRight
                className={cn("text-fg-faint mt-0.5 h-4 w-4 shrink-0 transition", isOpen && "rotate-90")}
              />
              <span className="min-w-0">
                <code className="text-fg font-mono text-[13px] font-semibold">{e.event}</code>
                <span className="text-fg-muted mt-0.5 block text-[13px] leading-6">
                  <Inline text={e.when} />
                </span>
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <JsonBlock
                  title="Example request body"
                  value={{
                    id: "evt_5f2b8c41a9e0d3b7c6a1f4e2",
                    event: e.event,
                    created_at: "2026-10-26T11:02:11Z",
                    number: { id: 12, name: "Main number", phone: "+91 98XXX XXXXX" },
                    data: e.data,
                  }}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "p":
      return (
        <p className="text-fg-muted text-[15px] leading-7">
          <Inline text={b.text} />
        </p>
      );
    case "h2": {
      const id = headingId(b);
      return (
        <h2
          id={id}
          className="group text-fg !mt-11 scroll-mt-32 text-[22px] leading-tight font-semibold tracking-tight"
        >
          <Inline text={b.text} />
          <Anchor id={id} />
        </h2>
      );
    }
    case "h3": {
      const id = headingId(b);
      return (
        <h3 id={id} className="group text-fg !mt-8 scroll-mt-32 text-[17px] font-semibold">
          <Inline text={b.text} />
          <Anchor id={id} />
        </h3>
      );
    }
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag
          className={cn(
            "text-fg-muted marker:text-fg-faint space-y-1.5 pl-5 text-[15px] leading-7",
            b.ordered ? "list-decimal" : "list-disc"
          )}
        >
          {b.items.map((item, i) => (
            <li key={i} className="pl-1">
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "callout": {
      const s = CALLOUT[b.kind];
      return (
        <div className={cn("flex gap-3 rounded-xl border px-4 py-3", s.box)}>
          <s.icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.icon_)} aria-hidden />
          <div className="text-fg-muted min-w-0 text-[13.5px] leading-6">
            {b.title && <p className="text-fg mb-0.5 font-semibold">{b.title}</p>}
            <Inline text={b.text} />
          </div>
        </div>
      );
    }
    case "steps":
      return (
        <ol className="relative space-y-6">
          {b.items.map((s, i) => (
            <li key={i} className="relative pl-10">
              {i < b.items.length - 1 && (
                <span className="bg-line absolute top-8 bottom-[-1.25rem] left-[13px] w-px" aria-hidden />
              )}
              <span className="bg-primary text-primary-fg absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm">
                {i + 1}
              </span>
              <p className="text-fg pt-0.5 text-[15px] font-semibold">{s.title}</p>
              <p className="text-fg-muted mt-1 text-[14.5px] leading-7">
                <Inline text={s.text} />
              </p>
              {s.image && (
                <div className="mt-3">
                  <Shot shot={s.image} />
                </div>
              )}
            </li>
          ))}
        </ol>
      );
    case "image":
      return <Shot shot={b.shot} />;
    case "code":
      return <CodeBlock code={b.code} lang={b.lang} title={b.title} />;
    case "codetabs":
      return <CodeTabs samples={b.samples} />;
    case "endpoint":
      return <Endpoint spec={b.spec} />;
    case "params":
      return <Params title={b.title} rows={b.rows} />;
    case "json":
      return <JsonBlock value={b.value} title={b.title} status={b.status} />;
    case "table":
      return (
        <div className="border-line overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[480px] text-left text-[13px]">
            <thead className="bg-page/70">
              <tr>
                {b.head.map((h) => (
                  <th key={h} className="text-fg border-line border-b px-3.5 py-2.5 text-xs font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {b.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="text-fg-muted px-3.5 py-2.5 align-top leading-6">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cards":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {b.items.map((c) => {
            const Icon = CARD_ICONS[c.icon] ?? Rocket;
            return (
              <Link
                key={c.href}
                href={c.href}
                className="border-line bg-surface hover:border-primary/40 group flex gap-3 rounded-xl border p-4 shadow-xs transition hover:shadow-sm"
              >
                <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="text-fg group-hover:text-primary block text-sm font-semibold">
                    {c.title}
                  </span>
                  <span className="text-fg-subtle mt-0.5 block text-[13px] leading-5">{c.text}</span>
                </span>
              </Link>
            );
          })}
        </div>
      );
    case "events":
      return <Events />;
  }
}
