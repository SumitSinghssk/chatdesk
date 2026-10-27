"use client";

import { cn } from "@/lib/utils";

import { defaultData, SHAPES, type ShapeKind } from "./model";
import { Outline } from "./Shape";

export const DRAG_TYPE = "application/x-diagram-shape";

const GROUPS = [...new Set(SHAPES.map((s) => s.group))];

function Icon({ kind }: { kind: ShapeKind }) {
  const box = kind === "frame" ? { w: 30, h: 22 } : kind === "person" ? { w: 18, h: 24 } : { w: 30, h: 20 };
  const data = { ...defaultData(kind), strokeWidth: 1.25 };
  if (kind === "text") {
    return <span className="text-fg-muted text-[15px] leading-none font-semibold">T</span>;
  }
  return (
    <span className="relative block" style={{ width: box.w, height: box.h }}>
      <Outline data={data} w={box.w} h={box.h} />
    </span>
  );
}

/** Shapes to add: click puts one in the middle of the screen, or drag it onto the canvas. */
export function Palette({ onAdd, compact }: { onAdd: (kind: ShapeKind) => void; compact?: boolean }) {
  return (
    <div className={cn("space-y-3", compact ? "p-3" : "p-2.5")}>
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="text-fg-faint mb-1.5 px-1 text-[10.5px] font-semibold tracking-wide uppercase">
            {group}
          </p>
          <div className={cn("grid gap-1", compact ? "grid-cols-4" : "grid-cols-2")}>
            {SHAPES.filter((s) => s.group === group).map((s) => (
              <button
                key={s.kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, s.kind);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onAdd(s.kind)}
                title={`${s.label}: ${s.hint}`}
                aria-label={`Add ${s.label}`}
                className="hover:bg-hover border-line/0 hover:border-line flex cursor-grab flex-col items-center gap-1 rounded-lg border px-1 py-2 transition active:cursor-grabbing"
              >
                <span className="flex h-6 items-center justify-center">
                  <Icon kind={s.kind} />
                </span>
                <span className="text-fg-subtle w-full truncate text-center text-[10.5px] leading-tight">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!compact && (
        <p className="text-fg-faint px-1 pt-1 text-[11px] leading-relaxed">
          Drag from a shape&apos;s edge dot to another shape to draw a line. Double-click to type.
        </p>
      )}
    </div>
  );
}
