"use client";

import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useBuilder } from "./context";

export type FlowEdge = Edge;

function stroke(handle: string | null | undefined) {
  if (handle === "no" || handle === "fail") return "#ef4444";
  if (handle === "invalid" || handle === "other") return "#f59e0b";
  if (handle === "yes" || handle === "ok") return "#10b981";
  if (handle?.startsWith("b:") || handle?.startsWith("r:")) return "#8b5cf6";
  return "#94a3b8";
}

function FlowConnection({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  selected,
  markerEnd,
}: EdgeProps<FlowEdge>) {
  const { testEdges, editable, removeEdge } = useBuilder();
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });
  const walked = testEdges.has(`${source}|${sourceHandleId ?? "out"}`);
  const color = walked ? "#10b981" : stroke(sourceHandleId);
  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected || hover || walked ? 3 : 2,
          strokeDasharray: walked ? "6 4" : undefined,
          animation: walked ? "chatbot-dash 0.8s linear infinite" : undefined,
        }}
      />
      {editable && (selected || hover) && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Remove connection"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => removeEdge(id)}
            className={cn(
              "nodrag nopan bg-surface border-line text-fg-subtle absolute flex h-6 w-6 items-center justify-center rounded-full border shadow-md hover:border-red-400 hover:text-red-600"
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const EDGE_TYPES = { flow: FlowConnection };
export { stroke as edgeColor };
