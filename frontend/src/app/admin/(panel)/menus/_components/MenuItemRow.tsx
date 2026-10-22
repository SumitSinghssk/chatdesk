"use client";

import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge, Button, Input, Switch } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { MAX_DEPTH, type DropPosition, type NodePath, type TreeNode } from "./tree";

export interface RowHandlers {
  update: (path: NodePath, patch: Partial<TreeNode>) => void;
  remove: (path: NodePath, node: TreeNode) => void;
  addChild: (path: NodePath) => void;
  toggleOpen: (uid: string) => void;
}

export interface DragState {
  dragUid: string | null;
  dropAt: { uid: string; position: DropPosition } | null;
  start: (uid: string) => void;
  over: (uid: string, position: DropPosition) => boolean;
  drop: () => void;
  end: () => void;
}

export function MenuItemRow({
  node,
  path,
  readOnly,
  openIds,
  invalidIds,
  handlers,
  drag,
}: {
  node: TreeNode;
  path: NodePath;
  readOnly: boolean;
  openIds: Set<string>;
  invalidIds: Set<string>;
  handlers: RowHandlers;
  drag: DragState;
}) {
  const level = path.length;
  const open = openIds.has(node.uid);
  const invalid = invalidIds.has(node.uid);
  const canAddChild = level < MAX_DEPTH;
  const dragging = drag.dragUid === node.uid;
  const dropHere = drag.dropAt?.uid === node.uid ? drag.dropAt.position : null;

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!drag.dragUid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const half: DropPosition = ratio < 0.5 ? "before" : "after";
    const order: DropPosition[] = ratio > 0.25 && ratio < 0.75 ? ["inside", half] : [half];
    if (order.some((position) => drag.over(node.uid, position))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  return (
    <li>
      <div
        onDragOver={readOnly ? undefined : onDragOver}
        onDrop={(e) => {
          e.preventDefault();
          drag.drop();
        }}
        className={cn(
          "bg-surface relative rounded-xl border shadow-xs transition",
          invalid ? "border-danger" : open ? "border-primary/50" : "border-line",
          !node.is_active && "opacity-75",
          dragging && "opacity-40",
          dropHere === "inside" && "border-primary bg-primary-soft ring-primary/30 ring-2"
        )}
      >
        {(dropHere === "before" || dropHere === "after") && (
          <span
            aria-hidden
            className={cn(
              "bg-primary pointer-events-none absolute right-0 left-0 h-0.5 rounded-full",
              dropHere === "before" ? "-top-[5px]" : "-bottom-[5px]"
            )}
          />
        )}
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2"
          draggable={!readOnly}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", node.uid);
            drag.start(node.uid);
          }}
          onDragEnd={drag.end}
        >
          {!readOnly && (
            <GripVertical
              size={16}
              aria-hidden
              className="text-fg-faint shrink-0 cursor-grab active:cursor-grabbing"
            />
          )}
          <button
            type="button"
            onClick={() => handlers.toggleOpen(node.uid)}
            aria-expanded={open}
            className="focus-visible:ring-primary/40 flex min-w-0 flex-1 items-center gap-2 rounded text-left focus:outline-none focus-visible:ring-2"
          >
            {open ? (
              <ChevronDown size={15} className="text-fg-subtle shrink-0" />
            ) : (
              <ChevronRight size={15} className="text-fg-subtle shrink-0" />
            )}
            {level > 1 && <CornerDownRight size={13} className="text-fg-subtle shrink-0" />}
            <span className="min-w-0">
              <span
                className={cn("block truncate text-sm font-medium", node.label ? "text-fg" : "text-danger")}
              >
                {node.label || "Untitled item"}
              </span>
              <span className="text-fg-subtle block truncate text-xs">{node.url || "No URL"}</span>
            </span>
            {node.new_tab && (
              <ExternalLink size={12} className="text-fg-subtle shrink-0" aria-label="Opens in a new tab" />
            )}
            {!node.is_active && (
              <Badge tone="default">
                <EyeOff size={11} /> Hidden
              </Badge>
            )}
          </button>

          {!readOnly && (
            <div className="flex items-center gap-0.5">
              <IconButton
                icon={Plus}
                label="Add child item"
                disabled={!canAddChild}
                onClick={() => handlers.addChild(path)}
              />
              <IconButton
                icon={Pencil}
                label={open ? "Close editor" : "Edit"}
                onClick={() => handlers.toggleOpen(node.uid)}
              />
              <IconButton icon={Trash2} label="Delete" danger onClick={() => handlers.remove(path, node)} />
            </div>
          )}
        </div>

        {open && (
          <div className="border-line grid gap-3 border-t p-3 sm:grid-cols-2">
            <Input
              label="Label"
              required
              maxLength={80}
              value={node.label}
              disabled={readOnly}
              error={invalid && !node.label.trim() ? "Label is required" : undefined}
              onChange={(e) => handlers.update(path, { label: e.target.value })}
            />
            <Input
              label="URL"
              required
              maxLength={2000}
              placeholder="/about or https://…"
              value={node.url}
              disabled={readOnly}
              error={invalid && !node.url.trim() ? "URL is required" : undefined}
              onChange={(e) => handlers.update(path, { url: e.target.value })}
            />
            <Switch
              label="Open in new tab"
              checked={node.new_tab}
              disabled={readOnly}
              onChange={(v) => handlers.update(path, { new_tab: v })}
            />
            <Switch
              label="Visible"
              hint="Hidden items hide their children too."
              checked={node.is_active}
              disabled={readOnly}
              onChange={(v) => handlers.update(path, { is_active: v })}
            />
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="border-line mt-2 ml-4 space-y-2 border-l pl-3 sm:ml-6 sm:pl-4">
          {node.children.map((child, i) => (
            <MenuItemRow
              key={child.uid}
              node={child}
              path={[...path, i]}
              readOnly={readOnly}
              openIds={openIds}
              invalidIds={invalidIds}
              handlers={handlers}
              drag={drag}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      leftIcon={icon}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={danger ? "hover:bg-danger-soft hover:text-danger" : undefined}
    />
  );
}
