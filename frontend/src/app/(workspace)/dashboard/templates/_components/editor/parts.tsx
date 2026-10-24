"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { CardHeader } from "../../../_components/CardHeader";
import { Card, CardBody } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

/** A one-row choice of options (never wraps; scrolls sideways on narrow screens). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(({ value: v, label: text, icon: Icon }) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60",
              on
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-surface text-fg-subtle hover:border-line-strong hover:text-fg"
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  hint,
  optional,
  icon,
  actions,
  children,
}: {
  title: string;
  hint?: ReactNode;
  optional?: boolean;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            {optional && <span className="text-fg-faint text-xs font-normal">Optional</span>}
          </span>
        }
        icon={icon}
        description={hint}
        actions={actions}
      />
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

/** "12/60" under a field; turns red past the limit. */
export function Counter({ value, max }: { value: string | null | undefined; max: number }) {
  const n = value?.length ?? 0;
  return <span className={cn("tabular", n > max ? "text-danger" : "text-fg-faint")}>{`${n}/${max}`}</span>;
}
