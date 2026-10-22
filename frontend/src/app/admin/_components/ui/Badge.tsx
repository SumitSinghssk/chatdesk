import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "default"
  | "info"
  | "blue"
  | "success"
  | "green"
  | "warning"
  | "yellow"
  | "danger"
  | "red"
  | "brand"
  | "purple";

const TONES: Record<string, [string, string]> = {
  success: [
    "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    "bg-emerald-500",
  ],
  neutral: [
    "bg-slate-50 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40",
    "bg-slate-400",
  ],
  info: [
    "bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
    "bg-indigo-500",
  ],
  brand: [
    "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
    "bg-violet-500",
  ],
  warning: [
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    "bg-amber-500",
  ],
  danger: [
    "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20",
    "bg-red-500",
  ],
};
const ALIASES: Record<string, string> = {
  default: "neutral",
  blue: "info",
  green: "success",
  yellow: "warning",
  red: "danger",
  purple: "brand",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const [classes, dotClass] = TONES[ALIASES[tone] ?? tone] ?? TONES.neutral!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        classes,
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  active: "success",
  published: "success",
  inactive: "neutral",
  draft: "warning",
  new: "info",
  in_progress: "brand",
  replied: "success",
  on_hold: "warning",
  closed: "neutral",
  spam: "danger",
  pending: "warning",
  approved: "success",
  rejected: "neutral",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} dot>
      {label ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
