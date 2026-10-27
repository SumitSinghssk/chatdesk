"use client";

import { createContext, memo, useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ShapeData, ShapeNode } from "./model";

export interface EditorState {
  editable: boolean;
  /** the shape whose text is being typed */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  /** shapes other people have selected, with their colours */
  peerSelection: Map<string, string[]>;
  /** open comment threads per shape */
  commentCount: Map<string, number>;
}

export const EditorContext = createContext<EditorState>({
  editable: false,
  editingId: null,
  setEditingId: () => {},
  peerSelection: new Map(),
  commentCount: new Map(),
});

const SIDES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
] as const;

export function Outline({ data, w, h }: { data: ShapeData; w: number; h: number }) {
  const sw = data.strokeWidth ?? (data.shape === "frame" ? 1.5 : 1.5);
  const s = sw / 2;
  const dash =
    data.strokeStyle === "dashed" || data.shape === "frame"
      ? `${sw * 4} ${sw * 3}`
      : data.strokeStyle === "dotted"
        ? `${sw} ${sw * 2.5}`
        : undefined;
  const paint = {
    fill: data.shape === "text" ? "transparent" : (data.fill ?? "#ffffff"),
    stroke: data.shape === "text" ? "transparent" : (data.stroke ?? "#94a3b8"),
    strokeWidth: sw,
    strokeDasharray: dash,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const shape = (() => {
    switch (data.shape) {
      case "rounded":
        return <rect x={s} y={s} width={w - sw} height={h - sw} rx={Math.min(h / 2, 16)} {...paint} />;
      case "terminal":
        return <rect x={s} y={s} width={w - sw} height={h - sw} rx={(h - sw) / 2} {...paint} />;
      case "decision":
        return (
          <polygon points={`${w / 2},${s} ${w - s},${h / 2} ${w / 2},${h - s} ${s},${h / 2}`} {...paint} />
        );
      case "io": {
        const k = Math.min(22, w / 5);
        return (
          <polygon points={`${k + s},${s} ${w - s},${s} ${w - k - s},${h - s} ${s},${h - s}`} {...paint} />
        );
      }
      case "hexagon": {
        const k = Math.min(22, w / 4);
        return (
          <polygon
            points={`${k},${s} ${w - k},${s} ${w - s},${h / 2} ${w - k},${h - s} ${k},${h - s} ${s},${h / 2}`}
            {...paint}
          />
        );
      }
      case "circle":
        return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - s} ry={h / 2 - s} {...paint} />;
      case "database": {
        const ry = Math.min(12, h / 6);
        return (
          <>
            <path
              d={`M${s},${ry} L${s},${h - ry} A${w / 2 - s},${ry} 0 0 0 ${w - s},${h - ry} L${w - s},${ry}`}
              {...paint}
            />
            <ellipse cx={w / 2} cy={ry} rx={w / 2 - s} ry={ry - s} {...paint} />
          </>
        );
      }
      case "document":
        return (
          <path
            d={`M${s},${s} L${w - s},${s} L${w - s},${h - 12} C${w * 0.75},${h - 26} ${w * 0.3},${h + 4} ${s},${h - 12} Z`}
            {...paint}
          />
        );
      case "cloud":
        return (
          <svg viewBox="0 0 100 64" width={w} height={h} preserveAspectRatio="none" overflow="visible">
            <path
              d="M26 58 C10 58 4 47 10 39 C1 31 8 15 23 18 C26 5 46 1 53 12 C61 2 82 5 82 21 C97 21 100 40 89 46 C96 58 80 63 72 58 Z"
              {...paint}
            />
          </svg>
        );
      case "person": {
        const head = Math.min(w, h) * 0.22;
        return (
          <>
            <circle cx={w / 2} cy={head + s} r={head} {...paint} />
            <path
              d={`M${w * 0.12},${h * 0.72} C${w * 0.12},${h * 0.48} ${w * 0.88},${h * 0.48} ${w * 0.88},${h * 0.72} Z`}
              {...paint}
            />
          </>
        );
      }
      case "note": {
        const fold = Math.min(16, w / 6, h / 6);
        return (
          <path
            d={`M${s},${s} L${w - s},${s} L${w - s},${h - fold} L${w - fold},${h - s} L${s},${h - s} Z M${w - s},${h - fold} L${w - fold},${h - fold} L${w - fold},${h - s}`}
            {...paint}
          />
        );
      }
      case "frame":
        return <rect x={s} y={s} width={w - sw} height={h - sw} rx={10} {...paint} fillOpacity={0.35} />;
      case "text":
        return <rect x={0} y={0} width={w} height={h} fill="transparent" stroke="none" />;
      default:
        return <rect x={s} y={s} width={w - sw} height={h - sw} rx={4} {...paint} />;
    }
  })();
  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={w}
      height={h}
      aria-hidden
      style={data.shape === "note" ? { filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.12))" } : undefined}
    >
      {shape}
    </svg>
  );
}

function Label({
  id,
  data,
  editing,
  editable,
}: {
  id: string;
  data: ShapeData;
  editing: boolean;
  editable: boolean;
}) {
  const flow = useReactFlow();
  const { setEditingId } = useContext(EditorContext);
  const [draft, setDraft] = useState(data.label);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      setDraft(data.label); // eslint-disable-line react-hooks/set-state-in-effect -- start from the saved text
      requestAnimationFrame(() => area.current?.select());
    }
  }, [editing, data.label]);

  const style: CSSProperties = {
    color: data.text ?? (data.shape === "frame" ? "#475569" : "#0f172a"),
    fontSize: data.fontSize ?? 14,
    fontWeight: data.bold || data.shape === "frame" ? 600 : 400,
    fontStyle: data.italic ? "italic" : undefined,
    textAlign: data.align ?? (data.shape === "frame" ? "left" : "center"),
  };
  const place = cn(
    "absolute flex overflow-hidden leading-snug",
    data.shape === "frame"
      ? "inset-x-3 top-2 items-start"
      : data.shape === "person"
        ? "inset-x-0 bottom-0 h-[26%] items-center justify-center"
        : data.shape === "decision" || data.shape === "circle"
          ? "inset-[18%] items-center justify-center"
          : data.shape === "io" || data.shape === "hexagon"
            ? "inset-y-1 inset-x-[14%] items-center justify-center"
            : data.shape === "database"
              ? "inset-x-2 top-[22%] bottom-2 items-center justify-center"
              : "inset-x-2 inset-y-1 items-center justify-center"
  );
  const save = () => {
    setEditingId(null);
    if (draft !== data.label) flow.updateNodeData(id, { label: draft });
  };
  if (editing && editable) {
    return (
      <div className={place}>
        <textarea
          ref={area}
          value={draft}
          aria-label="Shape text"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              setDraft(data.label);
              setEditingId(null);
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          className="nodrag nowheel h-full w-full resize-none bg-transparent outline-none"
          style={{ ...style, textAlign: style.textAlign }}
        />
      </div>
    );
  }
  return (
    <div className={place}>
      <span className="w-full break-words whitespace-pre-wrap" style={style}>
        {data.label}
      </span>
    </div>
  );
}

function ShapeView({ id, data, selected, width, height }: NodeProps<ShapeNode>) {
  const { editable, editingId, setEditingId, peerSelection, commentCount } = useContext(EditorContext);
  const w = width ?? 160;
  const h = height ?? 64;
  const peers = peerSelection.get(id);
  const comments = commentCount.get(id);
  return (
    <div
      className={cn(
        "diagram-shape group relative h-full w-full",
        data.shape === "text" && selected && "outline-1 outline-sky-400 outline-dashed"
      )}
      onDoubleClick={() => editable && !data.locked && setEditingId(id)}
    >
      {editable && !data.locked && (
        <NodeResizer
          isVisible={selected}
          minWidth={data.shape === "text" ? 40 : 40}
          minHeight={24}
          color="#0ea5e9"
          handleClassName="!h-2.5 !w-2.5 !rounded-sm !border-2 !bg-white"
          lineClassName="!border-sky-400"
        />
      )}
      <Outline data={data} w={w} h={h} />
      <Label id={id} data={data} editing={editingId === id} editable={editable && !data.locked} />
      {peers && (
        <span
          className="pointer-events-none absolute -inset-1.5 rounded-lg border-2"
          style={{ borderColor: peers[0] }}
          aria-hidden
        />
      )}
      {data.locked && selected && (
        <Lock className="text-fg-faint absolute -top-5 right-0 h-3.5 w-3.5" aria-label="Locked" />
      )}
      {!!comments && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950 shadow">
          {comments}
        </span>
      )}
      {data.shape !== "frame" &&
        SIDES.map((side) => (
          <Handle
            key={side.id}
            id={side.id}
            type="source"
            position={side.position}
            isConnectable={editable}
            className={cn(
              "diagram-handle !h-2.5 !w-2.5 !border-2 !border-white !bg-sky-500 transition-opacity",
              editable ? "opacity-0 group-hover:opacity-100" : "!opacity-0",
              selected && editable && "opacity-100"
            )}
          />
        ))}
    </div>
  );
}

export const Shape = memo(ShapeView);
