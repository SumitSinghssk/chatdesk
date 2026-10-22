"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Field, controlClasses } from "./Field";
import { adminPortalTarget } from "./portal";
import { popoverPanelClass, usePopover } from "./usePopover";

export interface SelectOption {
  value: string | number;
  label: string;
  description?: string;
  group?: string;
  dot?: string;
  depth?: number;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  label?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  icon?: LucideIcon;
  size?: "sm" | "md";
  emptyMessage?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
  wrapperClassName?: string;
  menuWidth?: number;
  onBlur?: () => void;
}

export function Select({
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
  searchable,
  clearable,
  icon: Icon,
  size = "md",
  emptyMessage = "No options",
  id,
  name,
  className,
  wrapperClassName,
  menuWidth = 0,
  onBlur,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const triggerId = id || name || `select-${autoId}`;
  const listId = `${triggerId}-listbox`;
  const {
    setOpen: setPopoverOpen,
    withPanel,
    focusTrigger,
    open: popoverOpen,
    setTrigger,
    setPanel,
    style: popoverStyle,
  } = usePopover({ minWidth: menuWidth });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const current = value === null || value === undefined ? "" : String(value);
  const selected = options.find((o) => String(o.value) === current);
  const withSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((o) => `${o.label} ${o.description ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q))
      : options;
  }, [options, query]);

  const openMenu = () => {
    if (disabled) return;
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => String(o.value) === current)
      )
    );
    setPopoverOpen(true);
    withPanel((panel) => {
      if (withSearch) panel.querySelector<HTMLInputElement>("input")?.focus();
      panel.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    });
  };

  const close = () => {
    setPopoverOpen(false);
    onBlur?.();
  };

  const choose = (option: SelectOption | undefined) => {
    if (!option || option.disabled) return;
    if (String(option.value) !== current) onChange(String(option.value));
    close();
    focusTrigger();
  };

  const move = (delta: number) => {
    if (!filtered.length) return;
    let next = active;
    for (let i = 0; i < filtered.length; i++) {
      next = (next + delta + filtered.length) % filtered.length;
      if (!filtered[next]!.disabled) break;
    }
    setActive(next);
    withPanel((panel) => panel.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!popoverOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const actions: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => setActive(0),
      End: () => setActive(filtered.length - 1),
      Enter: () => choose(filtered[active]),
    };
    if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]!();
    } else if (e.key === "Tab") close();
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
      <div className="relative">
        {name && <input type="hidden" name={name} value={current} />}
        <button
          ref={setTrigger}
          id={triggerId}
          type="button"
          disabled={disabled}
          onClick={() => (popoverOpen ? close() : openMenu())}
          onKeyDown={onKeyDown}
          aria-haspopup="listbox"
          aria-expanded={popoverOpen}
          aria-controls={listId}
          aria-label={rest["aria-label"]}
          className={cn(
            controlClasses(!!error),
            "flex items-center gap-2 pr-2.5 pl-3 text-left",
            size === "sm" ? "h-9 text-sm" : "py-2",
            className
          )}
        >
          {Icon && <Icon className="text-fg-faint h-4 w-4 shrink-0" />}
          {selected?.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", selected.dot)} />}
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-fg-faint")}>
            {selected ? selected.label : placeholder}
          </span>
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-fg-faint hover:bg-hover hover:text-fg rounded p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn("text-fg-faint h-4 w-4 shrink-0 transition-transform", popoverOpen && "rotate-180")}
          />
        </button>
      </div>

      {popoverOpen &&
        createPortal(
          <div ref={setPanel} style={popoverStyle} className={popoverPanelClass} onKeyDown={onKeyDown}>
            {withSearch && (
              <div className="border-line shrink-0 border-b p-1.5">
                <div className="relative">
                  <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    role="combobox"
                    aria-controls={listId}
                    aria-expanded
                    aria-autocomplete="list"
                    aria-label="Search options"
                    placeholder="Search…"
                    className="border-line bg-surface text-fg placeholder:text-fg-faint focus:border-primary focus:ring-primary/15 h-8 w-full rounded-lg border pr-2 pl-8 text-sm focus:ring-2 focus:outline-none"
                  />
                </div>
              </div>
            )}
            <div id={listId} role="listbox" aria-labelledby={triggerId} className="overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="text-fg-faint px-2.5 py-6 text-center text-sm">{emptyMessage}</p>
              )}
              {filtered.map((option, index) => {
                const header =
                  option.group && option.group !== filtered[index - 1]?.group ? option.group : null;
                const isSelected = String(option.value) === current;
                return (
                  <div key={`${option.value}`} role="presentation">
                    {header && (
                      <div className="text-fg-faint px-2.5 pt-2 pb-1 text-[11px] font-medium select-none">
                        {header}
                      </div>
                    )}
                    <div
                      role="option"
                      data-index={index}
                      aria-selected={isSelected}
                      aria-disabled={option.disabled}
                      onMouseMove={() => setActive(index)}
                      onClick={() => choose(option)}
                      style={option.depth ? { paddingLeft: `${0.625 + option.depth}rem` } : undefined}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                        active === index && "bg-hover",
                        isSelected ? "text-fg font-medium" : "text-fg-muted",
                        option.disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      {option.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", option.dot)} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description && (
                          <span className="text-fg-subtle block truncate text-xs">{option.description}</span>
                        )}
                      </span>
                      {isSelected && <Check className="text-primary h-4 w-4 shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          adminPortalTarget()
        )}
    </Field>
  );
}
