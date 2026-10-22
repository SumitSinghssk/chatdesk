import type { CSSProperties, ReactNode } from "react";
import { Inbox, ShieldAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("skeleton block rounded-md", className)} style={style} />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-16 text-center", className)}>
      <div className="border-line bg-surface text-fg-faint mb-4 flex h-12 w-12 items-center justify-center rounded-xl border shadow-xs">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-fg text-sm font-semibold">{title}</p>
      {description && <p className="text-fg-subtle mt-1 max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function AccessDenied({
  message = "You don't have permission to view this page.",
}: {
  message?: string;
}) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Access denied"
      description={`${message} Ask an administrator if you need access.`}
      className="py-24"
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("flex items-center justify-center py-16", className)}
    >
      <div className="border-line border-t-primary h-7 w-7 animate-spin rounded-full border-[3px]" />
    </div>
  );
}

const ICON_TONES = {
  blue: "bg-indigo-50 text-indigo-600 ring-indigo-600/10 dark:bg-indigo-500/10 dark:text-indigo-300",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300",
  red: "bg-red-50 text-red-600 ring-red-600/10 dark:bg-red-500/10 dark:text-red-300",
  yellow: "bg-amber-50 text-amber-600 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300",
  purple: "bg-violet-50 text-violet-600 ring-violet-600/10 dark:bg-violet-500/10 dark:text-violet-300",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof ICON_TONES;
  hint?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "bg-surface flex w-full items-start justify-between gap-3 rounded-xl border p-4 text-left shadow-xs transition",
        active ? "border-primary ring-primary/15 ring-3" : "border-line",
        onClick && "hover:border-line-strong"
      )}
    >
      <span className="min-w-0">
        <span className="text-fg-subtle block text-xs font-medium">{label}</span>
        <span className="tabular text-fg mt-1.5 block text-2xl font-semibold tracking-tight">{value}</span>
        {hint && <span className="text-fg-subtle mt-1 block text-xs">{hint}</span>}
      </span>
      {Icon && (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            ICON_TONES[tone]
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      )}
    </Tag>
  );
}
