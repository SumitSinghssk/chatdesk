import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Field, controlClasses } from "./Field";

interface CommonProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  wrapperClassName?: string;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, CommonProps {
  leftIcon?: LucideIcon;
  rightAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, wrapperClassName, leftIcon: LeftIcon, rightAddon, className, id, required, ...rest },
  ref
) {
  const inputId = id || rest.name;
  return (
    <Field
      label={label}
      htmlFor={inputId}
      required={required}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <div className="relative flex items-center">
        {LeftIcon && <LeftIcon className="text-fg-faint pointer-events-none absolute left-3 z-10 h-4 w-4" />}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error}
          className={cn(
            controlClasses(!!error),
            "py-2 pr-3 pl-3",
            LeftIcon && "pl-9",
            rightAddon && "pr-9",
            className
          )}
          {...rest}
        />
        {rightAddon && (
          <div className="text-fg-faint absolute inset-y-0 right-3 flex items-center">{rightAddon}</div>
        )}
      </div>
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, CommonProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, wrapperClassName, className, id, required, rows = 4, ...rest },
  ref
) {
  const inputId = id || rest.name;
  return (
    <Field
      label={label}
      htmlFor={inputId}
      required={required}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        className={cn(controlClasses(!!error), "px-3 py-2 leading-relaxed", className)}
        {...rest}
      />
    </Field>
  );
});
