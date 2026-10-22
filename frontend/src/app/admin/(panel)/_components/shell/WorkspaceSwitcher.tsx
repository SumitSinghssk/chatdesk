"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import type { useWorkspace } from "./useWorkspace";

export function WorkspaceSwitcher({ workspace }: { workspace: ReturnType<typeof useWorkspace> }) {
  if (workspace.available.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Switch workspace"
      className="border-line bg-hover/80 inline-flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5"
    >
      {workspace.available.map((w) => {
        const active = w.key === workspace.current;
        const Icon = w.icon;
        return (
          <Link
            key={w.key}
            href={workspace.hrefFor(w.key)}
            title={`${w.label} workspace`}
            aria-label={`${w.label} workspace`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs font-semibold transition sm:px-2.5",
              active ? "bg-surface text-fg ring-line shadow-xs ring-1" : "text-fg-subtle hover:text-fg"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active && "text-primary")} />
            <span className="hidden sm:inline">{w.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
