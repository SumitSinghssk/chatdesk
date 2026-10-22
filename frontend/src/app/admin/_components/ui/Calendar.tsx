"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export const pad = (n: number) => String(n).padStart(2, "0");

export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseYmd(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(
    (value ?? "").trim()
  );
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, day);
  if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day)
    return null;
  return d;
}

export function todayYmd(): string {
  return toYmd(new Date());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function formatYmd(value: string | null | undefined): string {
  const d = parseYmd(value);
  return d ? `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
}

export interface CalendarProps {
  selected?: string;
  range?: { from?: string; to?: string };
  min?: string;
  max?: string;
  onPick: (ymd: string) => void;
  initial?: string;
}

export function Calendar({ selected, range, min, max, onPick, initial }: CalendarProps) {
  const start = parseYmd(initial ?? selected ?? range?.from) ?? new Date();
  const [view, setView] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const [picker, setPicker] = useState<"days" | "months" | "years">("days");
  const minD = parseYmd(min);
  const maxD = parseYmd(max);
  const today = todayYmd();

  const year = view.getFullYear();
  const month = view.getMonth();
  const yearsStart = Math.floor(year / 12) * 12;

  const step = (dir: 1 | -1) => {
    if (picker === "days") setView(new Date(year, month + dir, 1));
    else if (picker === "months") setView(new Date(year + dir, month, 1));
    else setView(new Date(year + dir * 12, month, 1));
  };

  const isDisabled = (d: Date) => (minD && d < minD) || (maxD && d > maxD);

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));

  const header =
    picker === "days"
      ? `${MONTHS_LONG[month]} ${year}`
      : picker === "months"
        ? String(year)
        : `${yearsStart} – ${yearsStart + 11}`;

  return (
    <div className="w-[17rem] select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={{ days: "Previous month", months: "Previous year", years: "Previous years" }[picker]}
          className="text-fg-subtle hover:bg-hover flex h-7 w-7 items-center justify-center rounded-md"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPicker(picker === "days" ? "months" : picker === "months" ? "years" : "days")}
          className="text-fg hover:bg-hover inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold transition"
          aria-live="polite"
        >
          {header}
          <ChevronDown
            className={cn("text-fg-faint h-3.5 w-3.5 transition", picker !== "days" && "rotate-180")}
          />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={{ days: "Next month", months: "Next year", years: "Next years" }[picker]}
          className="text-fg-subtle hover:bg-hover flex h-7 w-7 items-center justify-center rounded-md"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {picker === "days" && (
        <>
          <div className="text-fg-faint mb-1 grid grid-cols-7 text-center text-[11px] font-medium">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const ymd = toYmd(d);
              const outside = d.getMonth() !== month;
              const disabled = !!isDisabled(d);
              const isSelected = ymd === selected || ymd === range?.from || ymd === range?.to;
              const inRange = !!range?.from && !!range?.to && ymd > range.from && ymd < range.to;
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(ymd)}
                  aria-label={ymd}
                  aria-pressed={isSelected}
                  className={cn(
                    "tabular mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition",
                    isSelected
                      ? "bg-primary text-primary-fg font-semibold"
                      : inRange
                        ? "bg-primary-soft text-primary rounded-none"
                        : outside
                          ? "text-fg-faint hover:bg-hover"
                          : "text-fg-muted hover:bg-hover hover:text-fg",
                    !isSelected && ymd === today && "ring-primary/60 font-semibold ring-1 ring-inset",
                    disabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </>
      )}

      {picker === "months" && (
        <div className="grid h-56 grid-cols-3 grid-rows-4 gap-1.5">
          {MONTHS.map((name, index) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setView(new Date(year, index, 1));
                setPicker("days");
              }}
              className={cn(
                "hover:bg-hover rounded-lg text-sm transition",
                index === month
                  ? "bg-primary text-primary-fg hover:bg-primary font-semibold"
                  : "text-fg-muted"
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {picker === "years" && (
        <div className="grid h-56 grid-cols-3 grid-rows-4 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => yearsStart + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setView(new Date(y, month, 1));
                setPicker("months");
              }}
              className={cn(
                "tabular hover:bg-hover rounded-lg text-sm transition",
                y === year ? "bg-primary text-primary-fg hover:bg-primary font-semibold" : "text-fg-muted"
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
