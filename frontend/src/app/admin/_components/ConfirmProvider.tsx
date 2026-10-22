"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { adminPortalTarget } from "./ui/portal";
import { useEscapeLayer } from "./ui/useEscapeLayer";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";

import Button from "./ui/Button";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title?: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

const ICONS = {
  danger: {
    icon: Trash2,
    chip: "bg-red-50 text-red-600 ring-8 ring-red-50/60 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/5",
  },
  warning: {
    icon: AlertTriangle,
    chip: "bg-amber-50 text-amber-600 ring-8 ring-amber-50/60 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/5",
  },
  primary: {
    icon: HelpCircle,
    chip: "bg-indigo-50 text-indigo-600 ring-8 ring-indigo-50/60 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/5",
  },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions & { open: boolean }>({ open: false });
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setState({ open: true, ...options });
      }),
    []
  );

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  useEscapeLayer(state.open, () => close(false));

  const variant = state.variant ?? "danger";
  const { icon: Icon, chip } = ICONS[variant];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open &&
        createPortal(
          <div
            role="alertdialog"
            aria-modal="true"
            className="drawer-scrim admin-theme fixed inset-0 z-110 flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] sm:items-center"
            onMouseDown={(e) => e.target === e.currentTarget && close(false)}
          >
            <div className="modal-panel border-line bg-surface w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <span
                    className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", chip)}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 pt-1">
                    <h3 className="text-fg text-base font-semibold">{state.title ?? "Are you sure?"}</h3>
                    <div className="text-fg-subtle mt-1.5 text-sm leading-relaxed">
                      {state.message ?? "This action cannot be undone."}
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-line bg-page/60 flex justify-end gap-2 border-t px-6 py-3.5">
                <Button variant="secondary" onClick={() => close(false)}>
                  {state.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={variant === "danger" ? "danger" : "primary"}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {state.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </div>
          </div>,
          adminPortalTarget()
        )}
    </ConfirmContext.Provider>
  );
}
