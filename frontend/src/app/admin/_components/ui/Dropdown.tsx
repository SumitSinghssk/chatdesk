"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { useClickOutside } from "@/app/admin/_hooks/useClickOutside";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export function Dropdown({
  trigger,
  items,
  align = "right",
  width = "w-48",
  header,
}: {
  trigger: (open: boolean) => ReactNode;
  items: (DropdownItem | "divider")[];
  align?: "left" | "right";
  width?: string;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const visible = items.filter((i) => i === "divider" || !i.hidden);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger(open)}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            "border-line bg-surface absolute z-120 mt-2 overflow-hidden rounded-xl border p-1.5 shadow-xl",
            width,
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {header}
          {visible.map((item, i) => {
            if (item === "divider") return <div key={`d-${i}`} className="bg-line my-1 h-px" />;
            const Icon = item.icon;
            const classes = cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition disabled:opacity-50",
              item.danger
                ? "font-medium text-danger hover:bg-danger-soft"
                : "text-fg-muted hover:bg-hover hover:text-fg"
            );
            const content = (
              <>
                {Icon && <Icon className={cn("h-4 w-4 shrink-0", !item.danger && "text-fg-faint")} />}
                <span className="flex-1">{item.label}</span>
              </>
            );
            return item.href ? (
              <Link
                key={i}
                href={item.href}
                className={classes}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                {content}
              </Link>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={classes}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
