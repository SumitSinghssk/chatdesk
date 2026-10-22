"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { adminPortalTarget } from "./portal";
import { Filter, Pencil, Search, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

import Button from "./Button";
import { Select } from "./Select";
import { HistoryButton } from "@/app/admin/_components/activity/HistoryButton";
import type { HistorySubject } from "@/app/admin/_store/historyStore";
import { usePopover } from "./usePopover";

export function ListToolbar({
  search,
  onSearch,
  placeholder = "Search…",
  children,
  onReset,
  showReset,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  onReset?: () => void;
  showReset?: boolean;
}) {
  return (
    <div className="border-line flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-4">
      {children && (
        <span className="text-fg-faint mr-0.5 hidden items-center gap-1.5 text-xs font-medium md:flex">
          <Filter className="h-4 w-4" />
          Filters
        </span>
      )}
      {children}
      <div className="ml-auto flex items-center gap-2">
        {showReset && onReset && (
          <Button variant="ghost" leftIcon={X} onClick={onReset}>
            Reset
          </Button>
        )}
        <ToolbarSearch value={search} onChange={onSearch} placeholder={placeholder} />
      </div>
    </div>
  );
}

export function ToolbarSearch({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { open, setOpen, style, setTrigger, setPanel, withPanel } = usePopover({
    matchWidth: false,
    maxHeight: 200,
  });
  const term = value.trim();

  const openPanel = () => {
    setOpen(true);
    withPanel((panel) => panel.querySelector<HTMLInputElement>("input")?.focus());
  };

  return (
    <>
      <div className="flex items-center" ref={setTrigger}>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-label={term ? `Search: ${term}` : "Search"}
          aria-expanded={open}
          title="Search"
          className={cn(
            "inline-flex h-9 items-center gap-2 text-sm font-medium shadow-xs transition",
            term
              ? "border-primary/30 bg-primary-soft text-primary max-w-60 rounded-l-lg border border-r-0 pr-2 pl-3"
              : "border-line bg-surface text-fg-subtle hover:border-line-strong hover:text-fg w-9 justify-center rounded-lg border",
            open && "border-primary ring-primary/15 ring-3"
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {term && <span className="truncate">“{term}”</span>}
        </button>
        {term && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            title="Clear search"
            className="border-primary/30 bg-primary-soft text-primary hover:bg-primary/15 inline-flex h-9 w-8 items-center justify-center rounded-r-lg border shadow-xs transition"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open &&
        createPortal(
          <div
            ref={setPanel}
            style={style}
            className="popover-panel border-line bg-surface z-[120] w-[min(22rem,calc(100vw-2rem))] rounded-xl border p-2 shadow-lg"
          >
            <div className="relative">
              <Search className="text-fg-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                placeholder={placeholder}
                aria-label="Search"
                className="border-line bg-page text-fg placeholder:text-fg-faint focus:border-primary focus:bg-surface focus:ring-primary/15 h-10 w-full rounded-lg border pr-3 pl-9 text-sm focus:ring-3 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <p className="text-fg-faint mt-2 flex items-center justify-between px-1 text-[11px]">
              <span>Results update as you type</span>
              <span className="flex items-center gap-1">
                <kbd className="border-line rounded border px-1 font-sans">Enter</kbd>
                <kbd className="border-line rounded border px-1 font-sans">Esc</kbd>
              </span>
            </p>
          </div>,
          adminPortalTarget()
        )}
    </>
  );
}

export function FilterSelect<T extends string = string>({
  value,
  onChange,
  options,
  label,
  searchable,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; dot?: string }[];
  label: string;
  searchable?: boolean;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(v) => onChange(v as T)}
      options={options}
      size="sm"
      searchable={searchable}
      wrapperClassName="w-auto"
      className="min-w-40"
      menuWidth={200}
    />
  );
}

export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!count) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClear]);

  if (!count || typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-theme border-line bg-surface/95 fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border p-2 pl-3 shadow-lg shadow-slate-900/10 backdrop-blur">
      <span className="tabular text-fg text-sm font-semibold whitespace-nowrap">{count} selected</span>
      <span className="bg-line mx-1 h-5 w-px" aria-hidden />
      {children}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        leftIcon={X}
        aria-label="Clear selection"
        onClick={onClear}
      />
    </div>,
    adminPortalTarget()
  );
}

export function RowActions({
  onEdit,
  editHref,
  onDelete,
  history,
  children,
}: {
  onEdit?: () => void;
  editHref?: string;
  onDelete?: () => void;
  history?: HistorySubject;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {children}
      {history && <HistoryButton subject={history} />}
      {(onEdit || editHref) && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={Pencil}
          aria-label="Edit"
          title="Edit"
          onClick={onEdit}
          href={editHref}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={Trash2}
          aria-label="Delete"
          title="Delete"
          onClick={onDelete}
          className="text-fg-faint hover:bg-danger-soft hover:text-danger"
        />
      )}
    </div>
  );
}
