import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  required,
  description,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1.5">
          <label htmlFor={htmlFor} className="text-fg-muted dark:text-fg block text-[13px] font-medium">
            {label}
            {required && (
              <span className="ml-0.5 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {description && <p className="text-fg-subtle mt-0.5 text-xs">{description}</p>}
        </div>
      )}
      {children}
      {error ? (
        <ErrorText message={error} />
      ) : hint ? (
        <p className="text-fg-subtle mt-1.5 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

export function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-danger mt-1.5 flex items-center gap-1 text-xs font-medium">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function ErrorBanner({ message, className }: { message: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{message}</div>
    </div>
  );
}

export const controlClasses = (hasError?: boolean) =>
  cn(
    "w-full rounded-lg border bg-surface-2 text-sm text-fg shadow-xs transition placeholder:text-fg-faint focus:ring-3 focus:outline-none",
    "disabled:cursor-not-allowed disabled:border-line disabled:bg-page disabled:text-fg-faint disabled:shadow-none",
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-500/15 dark:border-red-500/60"
      : "border-line-strong/80 hover:border-line-strong focus:border-primary focus:ring-primary/15"
  );
