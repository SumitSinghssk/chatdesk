"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { adminPortalTarget } from "../ui/portal";
import { Tooltip } from "../ui/Tooltip";
import { usePopover } from "../ui/usePopover";

type Popover = ReturnType<typeof usePopover>;

export function GridPopover({
  popover,
  trigger,
  children,
  className,
  label,
}: {
  popover: Popover;
  trigger: (props: { ref: (el: HTMLElement | null) => void; open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const { open, setOpen, setTrigger, setPanel, style } = popover;
  return (
    <>
      {trigger({ ref: setTrigger, open, toggle: () => setOpen(!open) })}
      {open &&
        createPortal(
          <div
            ref={setPanel}
            style={style}
            role="dialog"
            aria-label={label}
            className={cn(
              "popover-panel border-line bg-surface z-120 flex flex-col overflow-y-auto rounded-xl border shadow-lg",
              className
            )}
          >
            {children}
          </div>,
          adminPortalTarget()
        )}
    </>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  active,
  danger,
  disabled,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition disabled:pointer-events-none disabled:opacity-40",
        danger
          ? "text-danger hover:bg-danger-soft"
          : active
            ? "bg-primary-soft text-primary"
            : "text-fg-muted hover:bg-hover hover:text-fg"
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="flex-1">{children}</span>
    </button>
  );
}

export function ToolbarIconButton({
  refCb,
  active,
  onClick,
  label,
  icon: Icon,
  badge,
  tooltipAlign = "center",
}: {
  refCb?: (el: HTMLElement | null) => void;
  active?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  tooltipAlign?: "start" | "center" | "end";
}) {
  return (
    <Tooltip label={label} align={tooltipAlign}>
      <button
        ref={refCb}
        type="button"
        onClick={onClick}
        aria-label={badge ? `${label} (${badge})` : label}
        aria-expanded={active}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition",
          active || badge
            ? "border-primary/40 bg-primary-soft text-primary"
            : "border-line bg-surface text-fg-muted hover:bg-hover hover:text-fg"
        )}
      >
        <Icon className="h-4 w-4" />
        {!!badge && (
          <span className="bg-primary text-primary-fg absolute -top-1.5 -right-1.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold">
            {badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
