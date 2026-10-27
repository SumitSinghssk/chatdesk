"use client";

import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface Mentionable {
  id: number;
  name: string;
  color: string;
}

/** Who a text @mentions: the people whose "@Name" is in it. */
export const mentionsIn = (text: string, people: Mentionable[] | undefined) =>
  (people ?? []).filter((p) => text.includes(`@${p.name}`)).map((p) => p.id);

/** A comment's text with its @mentions highlighted. */
export function WithMentions({ text, names }: { text: string; names: string[] }): ReactNode {
  if (!names.length) return text;
  const escaped = names
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const parts = text.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return parts.map((part, i) =>
    i % 2 ? (
      <span key={i} className="bg-primary-soft text-primary rounded px-0.5 font-medium">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/**
 * A comment box where typing "@" suggests team members. Enter sends (Shift+Enter for a new line in the
 * multi-line box); Escape closes the suggestions, then cancels.
 */
export function MentionInput({
  value,
  onChange,
  people,
  onSubmit,
  onCancel,
  multiline,
  placeholder,
  label,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  people?: Mentionable[];
  onSubmit: () => void;
  onCancel?: () => void;
  multiline?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const matches =
    query === null || !people?.length
      ? []
      : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const look = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(/(?:^|\s)@([^\s@]{0,20})$/);
    setQuery(m ? m[1] : null);
    setActive(0);
  };
  const pick = (p: Mentionable) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,20})$/, `@${p.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === "Escape") {
        setQuery(null);
        return;
      }
    }
    if (e.key === "Escape") onCancel?.();
    if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      onSubmit();
    }
  };
  const common = {
    ref,
    value,
    "aria-label": label,
    placeholder,
    autoFocus,
    maxLength: 2000,
    onKeyDown,
    onChange: (e: { target: { value: string; selectionStart: number | null } }) => {
      onChange(e.target.value);
      look(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onBlur: () => setTimeout(() => setQuery(null), 150),
    className,
  };
  return (
    <div className="relative min-w-0 flex-1">
      {multiline ? <textarea rows={2} {...common} /> : <input {...common} />}
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="bg-surface border-line absolute bottom-full left-0 z-30 mb-1 w-56 overflow-hidden rounded-lg border py-1 shadow-lg"
        >
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]",
                  i === active ? "bg-hover text-fg" : "text-fg-muted"
                )}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: p.color }}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
