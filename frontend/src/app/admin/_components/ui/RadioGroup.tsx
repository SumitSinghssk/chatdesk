"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Field } from "./Field";

export interface RadioOption<T extends string = string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function RadioGroup<T extends string = string>({
  options,
  value,
  onChange,
  label,
  description,
  hint,
  error,
  disabled,
  columns = 1,
  name,
  wrapperClassName,
}: {
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
  name?: string;
  wrapperClassName?: string;
}) {
  const autoName = useId();
  const groupName = name ?? `radio-${autoName}`;

  return (
    <Field label={label} description={description} hint={hint} error={error} className={wrapperClassName}>
      <div
        role="radiogroup"
        className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}
      >
        {options.map((option) => {
          const checked = option.value === value;
          const isDisabled = disabled || option.disabled;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition",
                checked
                  ? "border-primary bg-primary-soft/50 ring-primary/10 ring-3"
                  : "border-line bg-surface hover:border-line-strong",
                isDisabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={checked}
                disabled={isDisabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  checked ? "border-primary bg-primary" : "border-line-strong bg-surface"
                )}
              >
                {checked && <span className="bg-primary-fg h-1.5 w-1.5 rounded-full" />}
              </span>
              <span className="min-w-0">
                <span className="text-fg block text-sm font-medium">{option.label}</span>
                {option.description && (
                  <span className="text-fg-subtle mt-0.5 block text-xs">{option.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </Field>
  );
}
