"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("no-scrollbar shadow-line flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0]", className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition",
              active
                ? "border-primary text-primary"
                : "text-fg-subtle hover:border-line-strong hover:text-fg border-transparent"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[11px] font-semibold",
                  active ? "bg-primary-soft text-primary" : "bg-hover text-fg-muted"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
