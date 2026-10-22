"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Field, controlClasses } from "./Field";

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorInput({
  value,
  onChange,
  label,
  hint,
  error,
  disabled,
  wrapperClassName,
  id: idProp,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  wrapperClassName?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [text, setText] = useState(value);
  const [trackedValue, setTrackedValue] = useState(value);
  if (value !== trackedValue) {
    setTrackedValue(value);
    setText(value);
  }
  const valid = HEX.test(text);

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={error ?? (!valid ? "Use a 6-digit hex colour like #4f46e5" : undefined)}
      className={wrapperClassName}
    >
      <div className="relative flex items-center">
        <label className="border-line absolute left-1.5 flex h-6 w-6 cursor-pointer overflow-hidden rounded-md border shadow-xs">
          <input
            type="color"
            value={HEX.test(value) ? value : "#000000"}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-10 -translate-x-2 -translate-y-2 cursor-pointer border-0 p-0"
            aria-label="Pick a colour"
          />
        </label>
        <input
          id={id}
          value={text}
          disabled={disabled}
          maxLength={7}
          onChange={(e) => {
            const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setText(next);
            if (HEX.test(next)) onChange(next.toLowerCase());
          }}
          className={cn(
            controlClasses(!valid || !!error),
            "tabular py-2 pr-3 pl-10 font-mono text-sm uppercase"
          )}
        />
      </div>
    </Field>
  );
}
