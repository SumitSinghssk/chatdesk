"use client";

import { memo, useContext, useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

import { cn } from "@/lib/utils";

import { LINE_COLORS, type LineEdge } from "./model";
import { EditorContext } from "./Shape";

function LineView(props: EdgeProps<LineEdge>) {
  const { id, data, selected, markerEnd, markerStart, sourceX, sourceY, targetX, targetY } = props;
  const { editable, editingId, setEditingId } = useContext(EditorContext);
  const flow = useReactFlow();
  const [draft, setDraft] = useState(data?.label ?? "");
  const input = useRef<HTMLInputElement>(null);
  const editing = editingId === `edge:${id}` && editable;
  useEffect(() => {
    if (editing) {
      setDraft(data?.label ?? ""); // eslint-disable-line react-hooks/set-state-in-effect -- start from the saved text
      requestAnimationFrame(() => input.current?.select());
    }
  }, [editing, data?.label]);

  const args = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  };
  const [path, labelX, labelY] =
    data?.path === "straight"
      ? getStraightPath(args)
      : data?.path === "curve"
        ? getBezierPath(args)
        : getSmoothStepPath({ ...args, borderRadius: data?.path === "step" ? 0 : 10 });
  const color = data?.color ?? LINE_COLORS[0];
  const width = data?.width ?? 1.75;

  const save = () => {
    setEditingId(null);
    if (draft !== (data?.label ?? "")) flow.updateEdgeData(id, { label: draft });
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={18}
        style={{
          stroke: selected ? "#0ea5e9" : color,
          strokeWidth: selected ? width + 0.75 : width,
          strokeDasharray: data?.dashed ? `${width * 4} ${width * 3}` : undefined,
        }}
      />
      {(data?.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onDoubleClick={() => editable && setEditingId(`edge:${id}`)}
          >
            {editing ? (
              <input
                ref={input}
                value={draft}
                aria-label="Line label"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="border-primary bg-surface text-fg w-32 rounded-md border px-1.5 py-0.5 text-center text-xs shadow outline-none"
              />
            ) : (
              <span
                className={cn(
                  "bg-surface text-fg border-line block max-w-48 rounded-md border px-1.5 py-0.5 text-center text-xs leading-snug font-medium shadow-xs",
                  selected && "border-sky-400"
                )}
              >
                {data?.label}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const Line = memo(LineView);
