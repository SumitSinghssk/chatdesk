"use client";

import { useState, type KeyboardEvent } from "react";
import { Tag, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** Chips + text box: Enter or comma adds a tag, Backspace on empty removes the last one. */
export function TagInput({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a tag and press Enter",
  id = "tags",
}: {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const tag = raw.trim().slice(0, 40);
    setDraft("");
    if (tag && !value.includes(tag)) onChange([...value, tag]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const q = draft.trim().toLowerCase();
  const offer = suggestions
    .filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q)))
    .slice(0, 8);

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-fg-muted dark:text-fg mb-1.5 block text-[13px] font-medium">
          {label}
        </label>
      )}
      <div className="border-line-strong bg-surface focus-within:border-primary focus-within:ring-primary/15 flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 focus-within:ring-3">
        <Tag className="text-fg-faint h-3.5 w-3.5 shrink-0" aria-hidden />
        {value.map((t) => (
          <span
            key={t}
            className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => onChange(value.filter((x) => x !== t))}
              className="hover:bg-primary/15 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : placeholder}
          maxLength={40}
          className="text-fg placeholder:text-fg-faint min-w-24 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {offer.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {offer.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(t)}
              className={cn(
                "border-line text-fg-subtle hover:border-primary hover:text-primary rounded-full border px-2 py-0.5 text-[11px]"
              )}
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
