"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-base text-fg shadow-xs transition placeholder:text-fg-faint focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none disabled:opacity-60";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, trailing, id, name, className, ...props },
  ref
) {
  const fieldId = id ?? name;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-fg-muted block text-sm font-medium">
          {label}
        </label>
        {trailing}
      </div>
      <input
        ref={ref}
        id={fieldId}
        name={name}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(inputClass, error && "border-danger focus:border-danger focus:ring-danger/15")}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="text-danger mt-1.5 text-sm">
          {error}
        </p>
      ) : (
        hint && <p className="text-fg-subtle mt-1.5 text-xs">{hint}</p>
      )}
    </div>
  );
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  full?: boolean;
};

export function Button({
  loading,
  variant = "primary",
  icon: Icon,
  full,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "focus-visible:ring-primary/25 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary hover:bg-primary-hover text-white shadow-sm",
        variant === "secondary" && "border-line-strong bg-surface text-fg hover:bg-hover border shadow-xs",
        variant === "ghost" && "text-fg-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        full && "w-full",
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-line bg-surface rounded-2xl border p-5 shadow-xs sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-fg text-lg font-semibold">{title}</h2>}
            {description && <p className="text-fg-subtle mt-1 text-sm">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
