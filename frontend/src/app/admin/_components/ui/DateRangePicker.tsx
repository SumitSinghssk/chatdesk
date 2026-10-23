"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";

import { formatYmd, pad, parseYmd, toYmd } from "./Calendar";
import { PickerTrigger, footerButton } from "./DatePicker";
import { Field } from "./Field";
import { adminPortalTarget } from "./portal";
import { usePopover } from "./usePopover";

export interface DateRange {
  from: string;
  to: string;
}

const today = () => new Date();
const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const range = (from: Date, to: Date): DateRange => ({ from: toYmd(from), to: toYmd(to) });

const PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: "today", label: "Today", range: () => range(today(), today()) },
  { key: "yesterday", label: "Yesterday", range: () => range(shift(today(), -1), shift(today(), -1)) },
  {
    key: "this-week",
    label: "This week (Sun – Today)",
    range: () => range(shift(today(), -today().getDay()), today()),
  },
  { key: "7", label: "Last 7 days", range: () => range(shift(today(), -6), today()) },
  {
    key: "last-week",
    label: "Last week (Sun – Sat)",
    range: () => {
      const sunday = shift(today(), -today().getDay() - 7);
      return range(sunday, shift(sunday, 6));
    },
  },
  { key: "28", label: "Last 28 days", range: () => range(shift(today(), -27), today()) },
  { key: "30", label: "Last 30 days", range: () => range(shift(today(), -29), today()) },
  {
    key: "month",
    label: "This month",
    range: () => range(new Date(today().getFullYear(), today().getMonth(), 1), today()),
  },
  {
    key: "last-month",
    label: "Last month",
    range: () => {
      const n = today();
      return range(
        new Date(n.getFullYear(), n.getMonth() - 1, 1),
        new Date(n.getFullYear(), n.getMonth(), 0)
      );
    },
  },
  { key: "90", label: "Last 90 days", range: () => range(shift(today(), -89), today()) },
  {
    key: "quarter",
    label: "Quarter to date",
    range: () => {
      const n = today();
      return range(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1), n);
    },
  },
  {
    key: "year",
    label: "This year (Jan – Today)",
    range: () => range(new Date(today().getFullYear(), 0, 1), today()),
  },
  {
    key: "last-year",
    label: "Last calendar year",
    range: () => {
      const y = today().getFullYear() - 1;
      return range(new Date(y, 0, 1), new Date(y, 11, 31));
    },
  },
];

const presetFor = (value: DateRange) =>
  value.from && value.to
    ? PRESETS.find((p) => {
        const r = p.range();
        return r.from === value.from && r.to === value.to;
      })
    : undefined;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function parseLoose(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const iso = parseYmd(t);
  if (iso) return toYmd(iso);
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/i.exec(t);
  if (m) {
    const month = MONTHS.findIndex((name) => name.toLowerCase() === m![2]!.toLowerCase());
    if (month >= 0) return validYmd(Number(m[3]), month + 1, Number(m[1]));
  }
  return null;
}

function validYmd(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? toYmd(date) : null;
}

function monthList(value: DateRange, min?: string, max?: string) {
  const n = today();
  let start = new Date(n.getFullYear() - 2, n.getMonth(), 1);
  let end = new Date(n.getFullYear(), n.getMonth() + 3, 1);
  const from = parseYmd(value.from);
  const to = parseYmd(value.to);
  if (from && from < start) start = new Date(from.getFullYear(), from.getMonth(), 1);
  if (to && to > end) end = new Date(to.getFullYear(), to.getMonth(), 1);
  const minD = parseYmd(min);
  const maxD = parseYmd(max);
  if (minD && minD > start) start = new Date(minD.getFullYear(), minD.getMonth(), 1);
  if (maxD && maxD < end) end = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
  const months: Date[] = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  return months;
}

export function DateRangePicker({
  value,
  onChange,
  label,
  hint,
  error,
  disabled,
  placeholder = "Any date",
  min,
  max,
  size,
  wrapperClassName,
  className,
  openOnMount,
  ...rest
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  size?: "sm" | "md";
  wrapperClassName?: string;
  className?: string;
  /** Open the range-selection dialog as soon as this picker is mounted. */
  openOnMount?: boolean;
  "aria-label"?: string;
}) {
  const autoId = useId();
  const triggerId = `range-${autoId}`;
  const popover = usePopover({ matchWidth: false, maxHeight: 460 });
  const {
    setOpen: setPopoverOpen,
    open: popoverOpen,
    setTrigger,
    setPanel,
    style: popoverStyle,
    withPanel,
  } = popover;

  const [draft, setDraft] = useState<DateRange>({ from: "", to: "" });
  const [editing, setEditing] = useState<"from" | "to">("from");
  const [hover, setHover] = useState<string | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const openedOnMount = useRef(false);

  const valuePreset = presetFor(value);
  const text = valuePreset
    ? valuePreset.label.replace(/ \(.*\)$/, "")
    : value.from && value.to
      ? value.from === value.to
        ? formatYmd(value.from)
        : `${formatYmd(value.from)} – ${formatYmd(value.to)}`
      : value.from
        ? `From ${formatYmd(value.from)}`
        : value.to
          ? `Until ${formatYmd(value.to)}`
          : "";

  const setRange = (next: DateRange, nextEditing: "from" | "to" = "from") => {
    setDraft(next);
    setFromText(formatYmd(next.from));
    setToText(formatYmd(next.to));
    setEditing(nextEditing);
  };

  const scrollToMonth = (ymd: string) => {
    const d = parseYmd(ymd) ?? today();
    withPanel((panel) => {
      const list = panel.querySelector<HTMLElement>("[data-months]");
      const month = panel.querySelector<HTMLElement>(
        `[data-month="${d.getFullYear()}-${pad(d.getMonth() + 1)}"]`
      );
      if (list && month) list.scrollTop = month.offsetTop - list.offsetTop - 8;
    });
  };

  const openPanel = () => {
    if (disabled) return;
    if (popoverOpen) return setPopoverOpen(false);
    setRange(value);
    setHover(null);
    setPopoverOpen(true);
    scrollToMonth(value.from || toYmd(today()));
  };

  useEffect(() => {
    if (!openOnMount || openedOnMount.current) return;
    openedOnMount.current = true;
    openPanel();
  }, [openOnMount, openPanel]);

  const apply = () => {
    onChange(draft.from && !draft.to ? { from: draft.from, to: draft.from } : draft);
    setPopoverOpen(false);
  };

  const pick = (ymd: string) => {
    if (editing === "from" || !draft.from || ymd < draft.from) {
      setRange({ from: ymd, to: draft.to && ymd <= draft.to && editing === "from" ? draft.to : "" }, "to");
    } else {
      setRange({ from: draft.from, to: ymd }, "from");
    }
  };

  const commitText = (which: "from" | "to", input: string) => {
    const ymd = parseLoose(input);
    if (!input.trim()) return setRange({ ...draft, [which]: "" }, which);
    if (!ymd) return setRange(draft, which);
    const next = { ...draft, [which]: ymd };
    if (next.from && next.to && next.from > next.to) [next.from, next.to] = [next.to, next.from];
    setRange(next, which === "from" ? "to" : "from");
    scrollToMonth(ymd);
  };

  const draftPreset = presetFor(draft);
  const months = monthList(draft, min, max);
  const minD = parseYmd(min);
  const maxD = parseYmd(max);
  const todayYmd = toYmd(today());
  const previewTo =
    editing === "to" && draft.from && !draft.to && hover && hover >= draft.from ? hover : draft.to;

  const dateField = (which: "from" | "to") => (
    <label
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-lg border px-2.5 py-1.5 transition",
        editing === which ? "border-primary ring-primary/20 ring-2" : "border-line"
      )}
    >
      <span className="text-fg-subtle text-[11px]">{which === "from" ? "Start date" : "End date"}</span>
      <input
        value={which === "from" ? fromText : toText}
        placeholder="DD Mon YYYY"
        onFocus={() => setEditing(which)}
        onChange={(e) => (which === "from" ? setFromText : setToText)(e.target.value)}
        onBlur={(e) => commitText(which, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText(which, e.currentTarget.value);
          }
        }}
        className="text-fg placeholder:text-fg-faint w-full bg-transparent text-sm outline-none"
      />
    </label>
  );

  return (
    <Field label={label} htmlFor={triggerId} hint={hint} error={error} className={wrapperClassName}>
      <PickerTrigger
        id={triggerId}
        icon={CalendarRange}
        text={text}
        placeholder={placeholder}
        open={popoverOpen}
        error={error}
        disabled={disabled}
        size={size}
        className={cn(size === "sm" && "min-w-56", className)}
        onOpen={openPanel}
        onClear={() => onChange({ from: "", to: "" })}
        triggerRef={setTrigger}
        aria-label={rest["aria-label"]}
      />
      {popoverOpen &&
        createPortal(
          <div
            ref={setPanel}
            style={popoverStyle}
            role="dialog"
            aria-label="Choose date range"
            className="popover-panel border-line bg-surface z-120 flex h-112 w-[min(36rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border shadow-lg"
          >
            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <ul className="border-line flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-52 sm:flex-col sm:gap-0 sm:overflow-y-auto sm:border-r sm:border-b-0 sm:px-0 sm:py-1.5">
                {[{ key: "custom", label: "Custom" }, ...PRESETS].map((preset) => {
                  const active = preset.key === "custom" ? !draftPreset : draftPreset?.key === preset.key;
                  return (
                    <li key={preset.key} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!("range" in preset)) return setEditing("from");
                          const next = preset.range();
                          setRange(next);
                          scrollToMonth(next.from);
                        }}
                        className={cn(
                          "w-full rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap transition sm:rounded-none sm:px-4",
                          active
                            ? "bg-primary-soft text-primary font-medium"
                            : "text-fg-muted hover:bg-hover hover:text-fg"
                        )}
                      >
                        {preset.label}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="border-line flex items-center gap-2 border-b p-3">
                  {dateField("from")}
                  <span className="text-fg-faint">–</span>
                  {dateField("to")}
                </div>
                <div className="border-line text-fg-faint grid grid-cols-7 border-b px-3 py-1.5 text-center text-[11px] font-medium">
                  {WEEKDAYS.map((w, i) => (
                    <span key={i}>{w}</span>
                  ))}
                </div>
                <div
                  data-months
                  className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-3"
                  onMouseLeave={() => setHover(null)}
                >
                  {months.map((month) => {
                    const y = month.getFullYear();
                    const m = month.getMonth();
                    const lead = month.getDay();
                    const count = new Date(y, m + 1, 0).getDate();
                    return (
                      <section key={`${y}-${m}`} data-month={`${y}-${pad(m + 1)}`} className="pt-3">
                        <h4 className="text-fg-subtle mb-1 text-xs font-semibold tracking-wide uppercase">
                          {MONTHS[m]} {y}
                        </h4>
                        <div className="grid grid-cols-7 gap-y-0.5">
                          {Array.from({ length: lead }, (_, i) => (
                            <span key={`lead-${i}`} />
                          ))}
                          {Array.from({ length: count }, (_, i) => {
                            const date = new Date(y, m, i + 1);
                            const ymd = toYmd(date);
                            const off = (minD && date < minD) || (maxD && date > maxD);
                            const isEdge = ymd === draft.from || ymd === previewTo;
                            const inRange =
                              !!draft.from && !!previewTo && ymd > draft.from && ymd < previewTo;
                            const hasRange = !!draft.from && !!previewTo && draft.from !== previewTo;
                            return (
                              <div
                                key={ymd}
                                className={cn(
                                  "flex h-8 items-center justify-center",
                                  inRange && "bg-primary-soft",
                                  hasRange && ymd === draft.from && "bg-primary-soft rounded-l-full",
                                  hasRange && ymd === previewTo && "bg-primary-soft rounded-r-full"
                                )}
                              >
                                <button
                                  type="button"
                                  disabled={!!off}
                                  onClick={() => pick(ymd)}
                                  onMouseEnter={() => setHover(ymd)}
                                  aria-label={formatYmd(ymd)}
                                  aria-pressed={isEdge}
                                  className={cn(
                                    "tabular flex h-8 w-8 items-center justify-center rounded-full text-sm transition",
                                    isEdge
                                      ? "bg-primary text-primary-fg font-semibold"
                                      : inRange
                                        ? "text-primary hover:bg-primary/15"
                                        : "text-fg-muted hover:bg-hover hover:text-fg",
                                    !isEdge &&
                                      ymd === todayYmd &&
                                      "ring-primary/60 font-semibold ring-1 ring-inset",
                                    off && "cursor-not-allowed opacity-35 hover:bg-transparent"
                                  )}
                                >
                                  {i + 1}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-line flex items-center gap-2 border-t px-3 py-2.5">
              <button
                type="button"
                className={footerButton.muted}
                onClick={() => setRange({ from: "", to: "" })}
              >
                Clear
              </button>
              <span className="text-fg-faint hidden truncate text-[11px] sm:inline">
                {editing === "to" && draft.from && !draft.to ? "Now pick the end date" : ""}
              </span>
              <div className="ml-auto flex gap-2">
                <button type="button" className={footerButton.muted} onClick={() => setPopoverOpen(false)}>
                  Cancel
                </button>
                <button type="button" className={footerButton.primary} onClick={apply}>
                  Apply
                </button>
              </div>
            </div>
          </div>,
          adminPortalTarget()
        )}
    </Field>
  );
}
