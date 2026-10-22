"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  indeterminate?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  indeterminate,
  disabled,
  className,
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <label
      className={cn(
        "text-fg-muted dark:text-fg inline-flex items-start gap-2 text-sm",
        disabled && "opacity-60",
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="border-line-strong accent-primary mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded"
        aria-label={rest["aria-label"]}
      />
      {(label || hint) && (
        <span className="leading-snug">
          {label}
          {hint && <span className="text-fg-subtle block text-xs">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  "aria-label"?: string;
}

export function Switch({ checked, onChange, label, hint, disabled, size = "md", ...rest }: SwitchProps) {
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const knob = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift = size === "sm" ? "translate-x-3" : "translate-x-4";
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50",
        track,
        checked ? "bg-primary" : "bg-line-strong"
      )}
    >
      <span className={cn("rounded-full bg-white shadow transition-transform", knob, checked && shift)} />
    </button>
  );
  if (!label) return button;
  return (
    <label className={cn("flex items-start gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <span className={size === "sm" ? "pt-0.5" : "pt-px"}>{button}</span>
      <span className="min-w-0 text-sm">
        <span className="text-fg block font-medium">{label}</span>
        {hint && <span className="text-fg-subtle mt-0.5 block text-xs">{hint}</span>}
      </span>
    </label>
  );
}
