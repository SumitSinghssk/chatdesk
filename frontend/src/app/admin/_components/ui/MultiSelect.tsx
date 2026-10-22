"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Field, controlClasses } from "./Field";
import { adminPortalTarget } from "./portal";
import type { SelectOption } from "./Select";
import { popoverPanelClass, usePopover } from "./usePopover";

export interface MultiSelectProps {
  options: SelectOption[];
  value: (string | number)[];
  onChange: (value: string[]) => void;
  label?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  maxChips?: number;
  id?: string;
  wrapperClassName?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  label,
  description,
  hint,
  error,
  required,
  disabled,
  placeholder = "Select…",
  emptyMessage = "No options",
  maxChips = 4,
  id,
  wrapperClassName,
}: MultiSelectProps) {
  const autoId = useId();
  const triggerId = id || `multiselect-${autoId}`;
  const {
    setOpen: setPopoverOpen,
    withPanel,
    setTrigger,
    open: popoverOpen,
    setPanel,
    style: popoverStyle,
  } = usePopover();
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(value.map(String)), [value]);
  const chosen = options.filter((o) => selected.has(String(o.value)));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (option: SelectOption) => {
    if (option.disabled) return;
    const key = String(option.value);
    onChange(selected.has(key) ? [...selected].filter((v) => v !== key) : [...selected, key]);
  };

  const openMenu = () => {
    if (disabled) return;
    setQuery("");
    setPopoverOpen(true);
    withPanel((panel) => panel.querySelector<HTMLInputElement>("input")?.focus());
  };

  return (
    <Field
      label={label}
      htmlFor={triggerId}
      required={required}
      description={description}
      hint={hint}
      error={error}
      className={wrapperClassName}
    >
      <div
        ref={setTrigger}
        id={triggerId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={popoverOpen}
        aria-disabled={disabled}
        onClick={() => (popoverOpen ? setPopoverOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (["Enter", " ", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          controlClasses(!!error),
          "flex min-h-9 flex-wrap items-center gap-1.5 py-1.5 pr-8 pl-2 text-left",
          disabled ? "pointer-events-none opacity-60" : "cursor-pointer",
          "relative"
        )}
      >
        {chosen.length === 0 && <span className="text-fg-faint px-1">{placeholder}</span>}
        {chosen.slice(0, maxChips).map((o) => (
          <span
            key={o.value}
            className="bg-primary-soft text-primary inline-flex max-w-full items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs font-medium"
          >
            <span className="truncate">{o.label}</span>
            <button
              type="button"
              aria-label={`Remove ${o.label}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(o);
              }}
              className="hover:bg-primary/15 rounded p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {chosen.length > maxChips && (
          <span className="text-fg-subtle text-xs font-medium">+{chosen.length - maxChips} more</span>
        )}
        <ChevronDown
          className={cn(
            "text-fg-faint absolute right-2.5 h-4 w-4 transition-transform",
            popoverOpen && "rotate-180"
          )}
        />
      </div>

      {popoverOpen &&
        createPortal(
          <div ref={setPanel} style={popoverStyle} className={popoverPanelClass}>
            <div className="border-line shrink-0 border-b p-1.5">
              <div className="relative">
                <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search options"
                  placeholder="Search…"
                  className="border-line bg-surface text-fg placeholder:text-fg-faint focus:border-primary focus:ring-primary/15 h-8 w-full rounded-lg border pr-2 pl-8 text-sm focus:ring-2 focus:outline-none"
                />
              </div>
            </div>
            <div role="listbox" aria-multiselectable className="overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="text-fg-faint px-2.5 py-6 text-center text-sm">{emptyMessage}</p>
              )}
              {filtered.map((option, index) => {
                const header =
                  option.group && option.group !== filtered[index - 1]?.group ? option.group : null;
                const isSelected = selected.has(String(option.value));
                return (
                  <div key={option.value} role="presentation">
                    {header && (
                      <div className="text-fg-faint px-2.5 pt-2 pb-1 text-[11px] font-medium select-none">
                        {header}
                      </div>
                    )}
                    <div
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(option)}
                      style={option.depth ? { paddingLeft: `${0.625 + option.depth}rem` } : undefined}
                      className={cn(
                        "hover:bg-hover flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
                        isSelected ? "text-fg font-medium" : "text-fg-muted",
                        option.disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "border-primary bg-primary text-primary-fg"
                            : "border-line-strong bg-surface"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-line flex shrink-0 items-center justify-between gap-2 border-t px-2.5 py-2 text-xs">
              <span className="text-fg-subtle">{selected.size} selected</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onChange([
                      ...new Set([
                        ...selected,
                        ...filtered.filter((o) => !o.disabled).map((o) => String(o.value)),
                      ]),
                    ])
                  }
                  className="text-primary hover:bg-primary-soft rounded-md px-2 py-1 font-medium"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-fg-subtle hover:bg-hover rounded-md px-2 py-1"
                >
                  Clear
                </button>
              </span>
            </div>
          </div>,
          adminPortalTarget()
        )}
    </Field>
  );
}
