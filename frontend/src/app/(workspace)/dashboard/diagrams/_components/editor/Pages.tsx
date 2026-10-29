"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Link2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Dropdown } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import type { Page } from "../../../_lib/diagramsApi";

/** Shapes without a page are on the first page a diagram ever had. */
export const FIRST_PAGE = "p1";
export const pagesOrDefault = (pages: Page[] | undefined | null): Page[] =>
  pages?.length ? pages : [{ id: FIRST_PAGE, name: "Page 1" }];

export type PageAction = "rename" | "duplicate" | "left" | "right" | "link" | "delete";

/** Page tabs under the canvas, like sheets in a spreadsheet. */
export function PageTabs({
  pages,
  current,
  canEdit,
  onPick,
  onAdd,
  onRename,
  onAction,
  menu = true,
}: {
  pages: Page[];
  current: string;
  canEdit: boolean;
  onPick: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onAction: (id: string, action: PageAction) => void;
  /** the ⋯ menu on the page on screen (rename, move, copy link…) */
  menu?: boolean;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const save = () => {
    if (renaming && draft.trim()) onRename(renaming, draft.trim().slice(0, 60));
    setRenaming(null);
  };
  return (
    <nav
      aria-label="Pages"
      className="border-line bg-surface flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-t px-2"
    >
      {pages.map((p, i) => {
        const on = p.id === current;
        if (renaming === p.id)
          return (
            <input
              key={p.id}
              autoFocus
              value={draft}
              maxLength={60}
              aria-label="Page name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") save();
                if (e.key === "Escape") setRenaming(null);
              }}
              className="border-primary bg-page text-fg h-7 w-36 shrink-0 rounded-md border px-2 text-[13px] outline-none"
            />
          );
        return (
          <div
            key={p.id}
            className={cn(
              "flex h-7 shrink-0 items-center rounded-md text-[13px] transition",
              on ? "bg-primary-soft text-primary font-semibold" : "text-fg-muted hover:bg-hover"
            )}
          >
            <button
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => onPick(p.id)}
              onDoubleClick={() => {
                if (!canEdit) return;
                setDraft(p.name);
                setRenaming(p.id);
              }}
              className="max-w-44 truncate px-2.5"
            >
              {p.name}
            </button>
            {on && menu && (
              <Dropdown
                align="left"
                width="w-52"
                trigger={() => (
                  <button
                    type="button"
                    aria-label={`${p.name}: more`}
                    className="hover:bg-primary/10 mr-0.5 rounded p-0.5"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                )}
                items={[
                  {
                    label: "Rename",
                    icon: Pencil,
                    hidden: !canEdit,
                    onClick: () => {
                      setDraft(p.name);
                      setRenaming(p.id);
                    },
                  },
                  {
                    label: "Duplicate",
                    icon: Copy,
                    hidden: !canEdit,
                    onClick: () => onAction(p.id, "duplicate"),
                  },
                  {
                    label: "Move left",
                    icon: ArrowLeft,
                    hidden: !canEdit || i === 0,
                    onClick: () => onAction(p.id, "left"),
                  },
                  {
                    label: "Move right",
                    icon: ArrowRight,
                    hidden: !canEdit || i === pages.length - 1,
                    onClick: () => onAction(p.id, "right"),
                  },
                  { label: "Copy link to this page", icon: Link2, onClick: () => onAction(p.id, "link") },
                  {
                    label: "Delete page",
                    icon: Trash2,
                    danger: true,
                    hidden: !canEdit || pages.length < 2,
                    onClick: () => onAction(p.id, "delete"),
                  },
                ]}
              />
            )}
          </div>
        );
      })}
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          disabled={pages.length >= 50}
          className="text-fg-subtle hover:bg-hover flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add page
        </button>
      )}
    </nav>
  );
}
