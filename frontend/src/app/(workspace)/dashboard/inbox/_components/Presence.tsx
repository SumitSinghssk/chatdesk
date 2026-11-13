"use client";

import type { ReactNode } from "react";
import { Eye, PenLine, StickyNote, TriangleAlert, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Presence } from "../../_lib/inboxApi";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

function names(list: Presence[]) {
  if (list.length === 1) return list[0]!.name;
  if (list.length === 2) return `${list[0]!.name} and ${list[1]!.name}`;
  return `${list[0]!.name} and ${list.length - 1} others`;
}

/** Three bouncing dots, like a chat app's "typing…". */
function Dots() {
  return (
    <span className="inline-flex items-end gap-0.5" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1 w-1 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${d}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}

function doing(p: Presence) {
  return p.state === "reply" ? "typing a reply" : p.state === "note" ? "writing a note" : "viewing";
}

/** Chat header: who else has this chat open, and whether they're typing. */
export function PresenceChip({ others }: { others: Presence[] }) {
  if (!others.length) return null;
  const replying = others.filter((o) => o.state === "reply");
  const noting = others.filter((o) => o.state === "note");
  const text = replying.length
    ? `${names(replying)} ${replying.length === 1 ? "is" : "are"} typing a reply`
    : noting.length
      ? `${names(noting)} ${noting.length === 1 ? "is" : "are"} writing a note`
      : `${names(others)} ${others.length === 1 ? "is" : "are"} viewing`;
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-[11px] font-semibold",
        replying.length ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"
      )}
      aria-live="polite"
      title={others.map((o) => `${o.name}: ${doing(o)}`).join("\n")}
    >
      <span className="flex -space-x-1.5">
        {others.slice(0, 3).map((o) => (
          <span
            key={o.id}
            className="bg-surface ring-surface flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-2"
          >
            {initials(o.name)}
          </span>
        ))}
      </span>
      <span className="truncate">{text}</span>
      {replying.length || noting.length ? <Dots /> : <Eye className="h-3 w-3 shrink-0" />}
    </span>
  );
}

/** Chat list: a small "who's on it" marker. */
export function PresenceMark({ others }: { others: Presence[] }) {
  if (!others.length) return null;
  const replying = others.find((o) => o.state === "reply");
  if (replying) {
    return (
      <span
        className="bg-warning-soft text-warning inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
        title={`${replying.name} is typing a reply`}
      >
        <PenLine className="h-3 w-3 shrink-0" />
        <span className="max-w-20 truncate">{replying.name.split(" ")[0]}</span>
      </span>
    );
  }
  const note = others.find((o) => o.state === "note");
  return (
    <span
      className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      title={`${names(others)} ${others.length === 1 ? "has" : "have"} this chat open`}
    >
      {note ? <StickyNote className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {others.length}
    </span>
  );
}

/** Warning above the reply box. */
export function CollisionBar({
  tone,
  children,
  actions,
}: {
  tone: "danger" | "warning" | "info";
  children: ReactNode;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
}) {
  const Icon = tone === "info" ? UserRound : TriangleAlert;
  return (
    <div
      role="status"
      className={cn(
        "mx-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-xs sm:mx-3",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "info" && "bg-primary-soft text-fg"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", tone === "info" && "text-primary")} aria-hidden />
      <p className="min-w-0 flex-1 basis-56 font-medium break-words [&_b]:font-bold">{children}</p>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={cn(
              "focus-visible:ring-primary h-7 rounded-md px-2.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:outline-none",
              a.primary
                ? "bg-primary text-primary-fg hover:bg-primary-hover"
                : "bg-surface/80 text-fg hover:bg-surface"
            )}
          >
            {a.label}
          </button>
        ))}
      </span>
    </div>
  );
}
