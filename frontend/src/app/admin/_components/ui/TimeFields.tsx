"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

import { pad } from "./Calendar";

export function parseTime(value: string | null | undefined): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? { h, m } : null;
}

export function formatTime(value: string | null | undefined, use24Hour = false): string {
  const t = parseTime(value);
  if (!t) return "";
  if (use24Hour) return `${pad(t.h)}:${pad(t.m)}`;
  return `${t.h % 12 || 12}:${pad(t.m)} ${t.h < 12 ? "AM" : "PM"}`;
}

const box =
  "tabular h-9 w-12 rounded-lg border border-line-strong bg-surface text-center text-sm font-medium text-fg shadow-xs transition focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none";
const stepper =
  "flex h-6 w-12 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg";

export function TimeFields({
  value,
  onChange,
  use24Hour = false,
  minuteStep = 1,
}: {
  value: string;
  onChange: (value: string) => void;
  use24Hour?: boolean;
  minuteStep?: number;
}) {
  const t = parseTime(value) ?? { h: 9, m: 0 };
  const set = (h: number, m: number) => onChange(`${pad(((h % 24) + 24) % 24)}:${pad(((m % 60) + 60) % 60)}`);
  const pm = t.h >= 12;
  const displayHour = use24Hour ? t.h : t.h % 12 || 12;

  const setHourFromInput = (raw: string) => {
    const n = Number(raw.replace(/\D/g, ""));
    if (Number.isNaN(n)) return;
    if (use24Hour) set(Math.min(23, n), t.m);
    else {
      const h12 = Math.min(12, Math.max(1, n || 12)) % 12;
      set(pm ? h12 + 12 : h12, t.m);
    }
  };

  const column = (
    label: string,
    display: number,
    onUp: () => void,
    onDown: () => void,
    onInput: (v: string) => void
  ) => (
    <div className="flex flex-col items-center gap-1">
      <button type="button" aria-label={`Increase ${label}`} onClick={onUp} className={stepper}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={pad(display)}
        onChange={(e) => onInput(e.target.value.slice(-2))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            if (e.key === "ArrowUp") onUp();
            else onDown();
          }
        }}
        onFocus={(e) => e.target.select()}
        className={box}
      />
      <button type="button" aria-label={`Decrease ${label}`} onClick={onDown} className={stepper}>
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex items-center justify-center gap-2">
      {column(
        "Hours",
        displayHour,
        () => set(t.h + 1, t.m),
        () => set(t.h - 1, t.m),
        setHourFromInput
      )}
      <span className="text-fg-faint pb-0.5 text-lg font-semibold">:</span>
      {column(
        "Minutes",
        t.m,
        () => set(t.h, Math.floor(t.m / minuteStep) * minuteStep + minuteStep),
        () => set(t.h, Math.ceil(t.m / minuteStep) * minuteStep - minuteStep),
        (v) => set(t.h, Math.min(59, Number(v.replace(/\D/g, "")) || 0))
      )}
      {!use24Hour && (
        <div
          className="border-line ml-1 inline-flex flex-col overflow-hidden rounded-lg border"
          role="group"
          aria-label="AM or PM"
        >
          {(["AM", "PM"] as const).map((period) => {
            const active = (period === "PM") === pm;
            return (
              <button
                key={period}
                type="button"
                aria-pressed={active}
                onClick={() => !active && set(t.h + (period === "PM" ? 12 : -12), t.m)}
                className={cn(
                  "h-8 px-2.5 text-[11px] font-semibold tracking-wide transition-colors",
                  active ? "bg-primary text-primary-fg" : "text-fg-subtle hover:bg-hover"
                )}
              >
                {period}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
