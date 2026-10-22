import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  children,
  side = "bottom",
  align = "center",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="presentation"
        className={cn(
          "pointer-events-none absolute z-130 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity delay-150 dark:bg-slate-700",
          "group-hover/tip:opacity-100 group-has-focus-visible/tip:opacity-100 [@media(hover:none)]:hidden",
          side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0"
        )}
      >
        {label}
      </span>
    </span>
  );
}
