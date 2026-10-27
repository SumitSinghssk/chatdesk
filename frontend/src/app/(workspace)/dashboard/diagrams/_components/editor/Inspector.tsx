"use client";

import type { ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Bold,
  BringToFront,
  Copy,
  Italic,
  Lock,
  LockOpen,
  Pencil,
  SendToBack,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
  Workflow,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { COLORS, LINE_COLORS, type LineData, type LineEdge, type ShapeData, type ShapeNode } from "./model";

export type Arrange =
  | "front"
  | "back"
  | "duplicate"
  | "delete"
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "spread-x"
  | "spread-y"
  | "tidy-TB"
  | "tidy-LR"
  | "edit-text"
  | "pick-icon"
  | "replace-image"
  | "row-add"
  | "row-remove"
  | "col-add"
  | "col-remove";

/** Shapes that keep their own look (no colour / border choices). */
const OWN_LOOK = new Set(["bubble-out", "bubble-in", "phone", "icon", "image"]);

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-fg-faint text-[10.5px] font-semibold tracking-wide uppercase">{title}</p>
      {children}
    </div>
  );
}

function Tool({
  label,
  icon: Icon,
  on,
  onClick,
  danger,
  children,
}: {
  label: string;
  icon?: typeof Bold;
  on?: boolean;
  onClick: () => void;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "border-line flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-medium transition",
        on ? "border-primary bg-primary-soft text-primary" : "text-fg-muted hover:bg-hover hover:text-fg",
        danger && "hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="bg-hover/60 flex gap-0.5 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium transition",
            value === o.value ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Style and arrange what's selected. */
export function Inspector({
  nodes,
  edges,
  onNodeData,
  onEdgeData,
  onArrange,
  onClose,
}: {
  nodes: ShapeNode[];
  edges: LineEdge[];
  onNodeData: (patch: Partial<ShapeData>) => void;
  onEdgeData: (patch: Partial<LineData>) => void;
  onArrange: (action: Arrange) => void;
  onClose?: () => void;
}) {
  const first = nodes[0]?.data;
  const line = edges[0]?.data ?? {};
  const many = nodes.length > 1;
  const title = nodes.length
    ? many
      ? `${nodes.length} shapes`
      : "Shape"
    : edges.length > 1
      ? `${edges.length} lines`
      : "Line";
  return (
    <div className="space-y-4 p-3" aria-label="Style">
      <div className="flex items-center justify-between">
        <p className="text-fg text-sm font-semibold">
          {title}
          {nodes.length > 0 && edges.length > 0 && (
            <span className="text-fg-subtle font-normal">
              {" "}
              + {edges.length} line{edges.length > 1 ? "s" : ""}
            </span>
          )}
        </p>
        {onClose && (
          <button
            type="button"
            aria-label="Close style panel"
            onClick={onClose}
            className="text-fg-subtle hover:bg-hover rounded-md p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {first && !many && <ShapeSettings data={first} onNodeData={onNodeData} onArrange={onArrange} />}
      {first && (
        <>
          {first.shape !== "text" && !OWN_LOOK.has(first.shape) && (
            <Group title="Colour">
              <div className="grid grid-cols-6 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    aria-label={`${c.name} colour`}
                    aria-pressed={first.fill === c.fill}
                    onClick={() => onNodeData({ fill: c.fill, stroke: c.stroke, text: c.text })}
                    className={cn(
                      "h-7 w-full rounded-md border-2 transition hover:scale-105",
                      first.fill === c.fill ? "ring-primary ring-2 ring-offset-1" : ""
                    )}
                    style={{ background: c.fill, borderColor: c.stroke }}
                  />
                ))}
              </div>
            </Group>
          )}
          <Group title="Text">
            <div className="flex flex-wrap gap-1">
              <Choice
                label="Text size"
                value={first.fontSize ?? 14}
                onChange={(fontSize) => onNodeData({ fontSize })}
                options={[
                  { value: 12, label: "S" },
                  { value: 14, label: "M" },
                  { value: 18, label: "L" },
                  { value: 24, label: "XL" },
                  { value: 32, label: "2XL" },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <Tool
                label="Bold"
                icon={Bold}
                on={!!first.bold}
                onClick={() => onNodeData({ bold: !first.bold })}
              />
              <Tool
                label="Italic"
                icon={Italic}
                on={!!first.italic}
                onClick={() => onNodeData({ italic: !first.italic })}
              />
              <span className="bg-line mx-0.5 w-px" />
              <Tool
                label="Align left"
                icon={TextAlignStart}
                on={first.align === "left"}
                onClick={() => onNodeData({ align: "left" })}
              />
              <Tool
                label="Centre"
                icon={TextAlignCenter}
                on={(first.align ?? "center") === "center" && first.shape !== "frame"}
                onClick={() => onNodeData({ align: "center" })}
              />
              <Tool
                label="Align right"
                icon={TextAlignEnd}
                on={first.align === "right"}
                onClick={() => onNodeData({ align: "right" })}
              />
              {!many && <Tool label="Edit text" icon={Pencil} onClick={() => onArrange("edit-text")} />}
            </div>
          </Group>
          {first.shape !== "text" && !OWN_LOOK.has(first.shape) && (
            <Group title="Border">
              <Choice
                label="Border style"
                value={first.strokeStyle ?? "solid"}
                onChange={(strokeStyle) => onNodeData({ strokeStyle })}
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "dashed", label: "Dashed" },
                  { value: "dotted", label: "Dotted" },
                ]}
              />
              <Choice
                label="Border width"
                value={first.strokeWidth ?? 1.5}
                onChange={(strokeWidth) => onNodeData({ strokeWidth })}
                options={[
                  { value: 1, label: "Thin" },
                  { value: 1.5, label: "Normal" },
                  { value: 2.5, label: "Thick" },
                ]}
              />
            </Group>
          )}
          {many && (
            <Group title="Line up">
              <div className="flex flex-wrap gap-1">
                <Tool
                  label="Line up left edges"
                  icon={AlignStartVertical}
                  onClick={() => onArrange("left")}
                />
                <Tool
                  label="Line up centres"
                  icon={AlignCenterVertical}
                  onClick={() => onArrange("center")}
                />
                <Tool
                  label="Line up right edges"
                  icon={AlignEndVertical}
                  onClick={() => onArrange("right")}
                />
                <Tool label="Line up tops" icon={AlignStartHorizontal} onClick={() => onArrange("top")} />
                <Tool
                  label="Line up middles"
                  icon={AlignCenterHorizontal}
                  onClick={() => onArrange("middle")}
                />
                <Tool label="Line up bottoms" icon={AlignEndHorizontal} onClick={() => onArrange("bottom")} />
                <Tool
                  label="Space evenly across"
                  icon={AlignHorizontalDistributeCenter}
                  onClick={() => onArrange("spread-x")}
                />
                <Tool
                  label="Space evenly down"
                  icon={AlignVerticalDistributeCenter}
                  onClick={() => onArrange("spread-y")}
                />
              </div>
              <div className="flex gap-1">
                <Tool label="Tidy up, top to bottom" icon={Workflow} onClick={() => onArrange("tidy-TB")}>
                  Tidy ↓
                </Tool>
                <Tool label="Tidy up, left to right" icon={Workflow} onClick={() => onArrange("tidy-LR")}>
                  Tidy →
                </Tool>
              </div>
            </Group>
          )}
          <Group title="Arrange">
            <div className="flex flex-wrap gap-1">
              <Tool label="Bring to front" icon={BringToFront} onClick={() => onArrange("front")} />
              <Tool label="Send to back" icon={SendToBack} onClick={() => onArrange("back")} />
              <Tool
                label={first.locked ? "Unlock" : "Lock (can't be moved)"}
                icon={first.locked ? Lock : LockOpen}
                on={!!first.locked}
                onClick={() => onNodeData({ locked: !first.locked })}
              />
              <Tool label="Duplicate" icon={Copy} onClick={() => onArrange("duplicate")} />
              <Tool label="Delete" icon={Trash2} danger onClick={() => onArrange("delete")} />
            </div>
          </Group>
        </>
      )}

      {!first && edges.length > 0 && (
        <>
          <Group title="Colour">
            <div className="flex flex-wrap gap-1.5">
              {LINE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Line colour ${c}`}
                  aria-pressed={(line.color ?? LINE_COLORS[0]) === c}
                  onClick={() => onEdgeData({ color: c })}
                  className={cn(
                    "h-6 w-6 rounded-full transition hover:scale-110",
                    (line.color ?? LINE_COLORS[0]) === c && "ring-primary ring-2 ring-offset-2"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Group>
          <Group title="Shape of the line">
            <Choice
              label="Line path"
              value={line.path ?? "smooth"}
              onChange={(path) => onEdgeData({ path })}
              options={[
                { value: "smooth", label: "Elbow" },
                { value: "step", label: "Sharp" },
                { value: "curve", label: "Curve" },
                { value: "straight", label: "Straight" },
              ]}
            />
            <Choice
              label="Line width"
              value={line.width ?? 1.75}
              onChange={(width) => onEdgeData({ width })}
              options={[
                { value: 1.25, label: "Thin" },
                { value: 1.75, label: "Normal" },
                { value: 3, label: "Thick" },
              ]}
            />
          </Group>
          <Group title="Ends and style">
            <div className="flex flex-wrap gap-1">
              <Tool
                label="Arrow at the end"
                on={line.arrowEnd !== false}
                onClick={() => onEdgeData({ arrowEnd: line.arrowEnd === false })}
              >
                —▶
              </Tool>
              <Tool
                label="Arrow at the start"
                on={!!line.arrowStart}
                onClick={() => onEdgeData({ arrowStart: !line.arrowStart })}
              >
                ◀—
              </Tool>
              <Tool label="Dashed" on={!!line.dashed} onClick={() => onEdgeData({ dashed: !line.dashed })}>
                - - -
              </Tool>
              <Tool
                label="Moving dots"
                on={!!line.animated}
                onClick={() => onEdgeData({ animated: !line.animated })}
              >
                Flow
              </Tool>
            </div>
          </Group>
          <div className="flex flex-wrap gap-1">
            {edges.length === 1 && (
              <Tool label="Add or edit the label" icon={Pencil} onClick={() => onArrange("edit-text")}>
                Label
              </Tool>
            )}
            <Tool label="Delete" icon={Trash2} danger onClick={() => onArrange("delete")}>
              Delete
            </Tool>
          </div>
        </>
      )}
    </div>
  );
}

const field =
  "border-line bg-page text-fg focus:border-primary w-full rounded-lg border px-2 py-1.5 text-[12.5px] leading-snug outline-none";

/** What only some shapes have: icons, pictures, tables, database tables, UML classes, message times. */
function ShapeSettings({
  data,
  onNodeData,
  onArrange,
}: {
  data: ShapeData;
  onNodeData: (patch: Partial<ShapeData>) => void;
  onArrange: (action: Arrange) => void;
}) {
  switch (data.shape) {
    case "icon":
      return (
        <Group title="Icon">
          <Tool label="Change icon" icon={Pencil} onClick={() => onArrange("pick-icon")}>
            Change icon
          </Tool>
          <div className="flex flex-wrap gap-1.5">
            {LINE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Icon colour ${c}`}
                aria-pressed={(data.text ?? "#334155") === c}
                onClick={() => onNodeData({ text: c })}
                className={cn(
                  "h-6 w-6 rounded-full transition hover:scale-110",
                  data.text === c && "ring-primary ring-2 ring-offset-2"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
          <Choice
            label="Background"
            value={data.fill ? "on" : "off"}
            onChange={(v) => onNodeData({ fill: v === "on" ? "#f1f5f9" : undefined })}
            options={[
              { value: "off", label: "No background" },
              { value: "on", label: "Soft tile" },
            ]}
          />
        </Group>
      );
    case "image":
      return (
        <Group title="Picture">
          <Tool label="Replace picture" icon={Pencil} onClick={() => onArrange("replace-image")}>
            Replace picture
          </Tool>
          <Choice
            label="Fit"
            value={data.fit ?? "contain"}
            onChange={(fit) => onNodeData({ fit })}
            options={[
              { value: "contain", label: "Show all" },
              { value: "cover", label: "Fill the box" },
            ]}
          />
        </Group>
      );
    case "table":
      return (
        <Group title="Table">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-fg-subtle w-16 text-xs">Rows</span>
            <Tool label="Remove a row" onClick={() => onArrange("row-remove")}>
              −
            </Tool>
            <Tool label="Add a row" onClick={() => onArrange("row-add")}>
              +
            </Tool>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-fg-subtle w-16 text-xs">Columns</span>
            <Tool label="Remove a column" onClick={() => onArrange("col-remove")}>
              −
            </Tool>
            <Tool label="Add a column" onClick={() => onArrange("col-add")}>
              +
            </Tool>
          </div>
          <Tool
            label="First row is a header"
            on={data.header !== false}
            onClick={() => onNodeData({ header: data.header === false })}
          >
            Header row
          </Tool>
          <p className="text-fg-faint text-[11px]">Double-click a cell to type. Tab moves to the next one.</p>
        </Group>
      );
    case "entity":
      return (
        <Group title="Columns">
          <textarea
            aria-label="Columns"
            rows={6}
            defaultValue={data.fields}
            key={data.fields}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => e.target.value !== data.fields && onNodeData({ fields: e.target.value })}
            className={cn(field, "font-mono")}
          />
          <p className="text-fg-faint text-[11px]">
            One per line: name, two spaces, type, two spaces, PK or FK.
          </p>
        </Group>
      );
    case "uml":
      return (
        <Group title="Class">
          <label className="text-fg-subtle block text-xs">Fields</label>
          <textarea
            aria-label="Fields"
            rows={4}
            defaultValue={data.fields}
            key={`f${data.fields}`}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => e.target.value !== data.fields && onNodeData({ fields: e.target.value })}
            className={cn(field, "font-mono")}
          />
          <label className="text-fg-subtle block text-xs">Methods</label>
          <textarea
            aria-label="Methods"
            rows={3}
            defaultValue={data.methods}
            key={`m${data.methods}`}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => e.target.value !== data.methods && onNodeData({ methods: e.target.value })}
            className={cn(field, "font-mono")}
          />
        </Group>
      );
    case "bubble-out":
    case "bubble-in":
      return (
        <Group title="Message">
          <input
            aria-label="Time shown"
            defaultValue={data.time}
            key={data.time}
            maxLength={12}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => e.target.value !== data.time && onNodeData({ time: e.target.value })}
            className={field}
            placeholder="10:24"
          />
          <p className="text-fg-faint text-[11px]">Double-click the bubble to change the message.</p>
        </Group>
      );
    default:
      return null;
  }
}
