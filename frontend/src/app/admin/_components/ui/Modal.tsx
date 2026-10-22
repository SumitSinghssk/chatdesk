"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { adminPortalTarget } from "./portal";
import { useEscapeLayer } from "./useEscapeLayer";
import { ArrowLeft, X } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  "2xl": "max-w-[min(1200px,94vw)]",
} as const;
const DRAWER_SIZES: Record<keyof typeof SIZES, string> = {
  sm: "md:max-w-md",
  md: "md:max-w-xl",
  lg: "md:max-w-3xl",
  xl: "md:max-w-5xl",
  "2xl": "md:max-w-[min(1200px,94vw)]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: keyof typeof SIZES;
  variant?: "modal" | "drawer";
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
  headerActions?: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
  variant,
  closeOnBackdrop = true,
  bodyClassName,
  headerActions,
}: ModalProps) {
  useEscapeLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const drawer = (variant ?? (size === "sm" ? "modal" : "drawer")) === "drawer";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        "drawer-scrim admin-theme fixed inset-0 z-50 flex bg-slate-950/40 backdrop-blur-[2px]",
        drawer ? "justify-end" : "sm:items-center sm:justify-center sm:p-4"
      )}
      onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "bg-surface flex w-full flex-col shadow-2xl",
          drawer ? DRAWER_SIZES[size] : SIZES[size],
          drawer
            ? "drawer-panel border-line h-full border-l"
            : "modal-panel sm:border-line h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border"
        )}
      >
        <div className="border-line flex items-start gap-3 border-b px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="text-fg-subtle hover:bg-hover -ml-1 rounded-lg p-1 sm:hidden"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-fg truncate text-base font-semibold">{title}</h3>
            {description && <p className="text-fg-subtle mt-0.5 line-clamp-2 text-sm">{description}</p>}
          </div>
          {headerActions && <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-fg-faint hover:bg-hover hover:text-fg hidden rounded-lg p-1.5 transition sm:block"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
        {footer && (
          <div className="border-line bg-page/60 flex items-center justify-end gap-2 border-t px-5 py-3.5 sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    adminPortalTarget()
  );
}
