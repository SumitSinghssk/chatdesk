import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-line bg-surface rounded-xl border shadow-xs", className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon: Icon,
  badge,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-line flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="border-line bg-page text-fg-subtle flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-fg text-sm font-semibold">{title}</h2>
          {(description || badge) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {badge && (
                <span className="bg-primary-soft text-primary rounded-full px-2 py-px text-[11px] font-semibold">
                  {badge}
                </span>
              )}
              {description && <p className="text-fg-subtle text-xs">{description}</p>}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative p-4 sm:p-5", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  count,
  backHref,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  count?: number;
  backHref?: string;
}) {
  const box =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface shadow-xs";
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className={cn(box, "text-fg-subtle hover:border-line-strong hover:text-fg transition")}
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
        ) : (
          Icon && (
            <span className={cn(box, "text-fg-muted")}>
              <Icon className="h-5 w-5" />
            </span>
          )
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-fg truncate text-xl font-semibold tracking-tight">{title}</h1>
            {count !== undefined && (
              <span className="tabular border-line bg-surface text-fg-muted rounded-full border px-2 py-px text-xs font-medium">
                {count.toLocaleString()}
              </span>
            )}
          </div>
          {description && (
            <p className="text-fg-subtle mt-0.5 line-clamp-2 text-sm sm:line-clamp-1">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} icon={icon} actions={actions} />
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}
