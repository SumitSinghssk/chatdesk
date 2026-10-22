"use client";

import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const KPI_TONES = {
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  blue: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  purple: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  slate: "bg-slate-500/10 text-slate-500",
} as const;
export type KpiTone = keyof typeof KPI_TONES;

export function KpiGrid({
  children,
  cols = 6,
  className,
}: {
  children: ReactNode;
  cols?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3",
        { 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" }[cols],
        className
      )}
    >
      {children}
    </div>
  );
}

export function KpiTile({
  icon: Icon,
  tone = "indigo",
  label,
  value,
  hint,
  onClick,
  active,
  title,
}: {
  icon: LucideIcon;
  tone?: KpiTone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "border-line bg-surface flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 text-left shadow-xs transition",
        onClick && "hover:border-line-strong hover:shadow-sm",
        active && "border-primary ring-primary/15 ring-3"
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", KPI_TONES[tone])}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="text-fg-subtle block truncate text-xs font-medium">{label}</span>
        <span className="text-fg block text-xl leading-tight font-semibold tabular-nums">{value ?? "—"}</span>
        {hint && <span className="text-fg-subtle block truncate text-[11px]">{hint}</span>}
      </span>
    </Tag>
  );
}

export function TrendHint({
  current,
  previous,
  suffix,
}: {
  current: number;
  previous: number;
  suffix?: ReactNode;
}) {
  const trend = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return (
    <span className="inline-flex items-center gap-1">
      {trend !== null && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-medium",
            trend >= 0 ? "text-success" : "text-danger"
          )}
        >
          {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend)}%
        </span>
      )}
      {suffix && (
        <span>
          {trend !== null && "· "}
          {suffix}
        </span>
      )}
    </span>
  );
}

export interface MixItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function KpiMixTile({
  label,
  items,
  total,
  onSelect,
  emptyText = "Nothing yet",
  className,
}: {
  label: string;
  items: MixItem[] | undefined;
  total?: number;
  onSelect?: (key: string) => void;
  emptyText?: string;
  className?: string;
}) {
  const shown = (items ?? []).filter((i) => i.value > 0);
  const sum = shown.reduce((s, i) => s + i.value, 0);
  const Seg = onSelect ? "button" : "span";
  return (
    <div
      className={cn(
        "border-line bg-surface col-span-2 flex min-w-0 flex-col justify-center gap-2 rounded-xl border px-3.5 py-3 shadow-xs sm:col-span-1",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-fg-subtle text-xs font-medium">{label}</span>
        <span className="text-fg-subtle text-[11px] tabular-nums">
          {items ? `${total ?? sum} total` : "—"}
        </span>
      </div>
      <div className="bg-page flex h-2 overflow-hidden rounded-full">
        {shown.map((i) => (
          <Seg
            key={i.key}
            type={onSelect ? "button" : undefined}
            title={`${i.label}: ${i.value}`}
            aria-label={onSelect ? `Show ${i.label} (${i.value})` : undefined}
            onClick={onSelect ? () => onSelect(i.key) : undefined}
            className={cn("h-full transition", onSelect && "hover:opacity-80", i.color)}
            style={{ width: `${(i.value / sum) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {shown.map((i) => (
          <Seg
            key={i.key}
            type={onSelect ? "button" : undefined}
            onClick={onSelect ? () => onSelect(i.key) : undefined}
            className={cn(
              "text-fg-subtle inline-flex items-center gap-1 text-[11px]",
              onSelect && "hover:text-fg"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", i.color)} />
            {i.label} <b className="text-fg font-semibold tabular-nums">{i.value}</b>
          </Seg>
        ))}
        {items && shown.length === 0 && <span className="text-fg-faint text-[11px]">{emptyText}</span>}
      </div>
    </div>
  );
}
