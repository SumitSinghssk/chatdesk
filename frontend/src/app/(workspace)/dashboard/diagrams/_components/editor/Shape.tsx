"use client";

import { createContext, memo, useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Lock, Minus, Plus, ThumbsUp } from "lucide-react";

import { cn } from "@/lib/utils";

import type { RecordCard } from "../../../_lib/diagramsApi";
import type { ShapeData, ShapeNode } from "./model";
import { SPECIAL, SpecialBody, TITLED, titlePlace } from "./Special";

export interface EditorState {
  editable: boolean;
  /** the shape whose text is being typed */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  /** shapes other people have selected, with their colours */
  peerSelection: Map<string, string[]>;
  /** open comment threads per shape */
  commentCount: Map<string, number>;
  /** dot voting: votes per shape, this person's own, and whether they can vote now */
  votes?: {
    open: boolean;
    canVote: boolean;
    counts: Map<string, number>;
    mine: Set<string>;
    onVote: (id: string) => void;
  };
  /** live ChatDesk cards: what each shows (by "type:id"), and whether they open in ChatDesk */
  records?: { cards: Map<string, RecordCard>; canOpen: boolean };
  /** mind maps: how many ideas sit under each one, which side they grow on, and what keys do */
  mind?: {
    kids: Map<string, number>;
    side: Map<string, "l" | "r">;
    folded: (id: string) => boolean;
    act: (id: string, action: "save" | "child" | "sibling" | "fold", label?: string) => void;
  };
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
  const { setEditingId, mind } = useContext(EditorContext);
  const [draft, setDraft] = useState(data.label);
  const area = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false); // the text was already handled (a key moved on to another idea)
  const idea = data.shape === "mind" && !!mind;
  useEffect(() => {
    if (editing) {
      done.current = false;
      setDraft(data.label); // eslint-disable-line react-hooks/set-state-in-effect -- start from the saved text
      requestAnimationFrame(() => area.current?.select());
    }
  }, [editing, data.label]);

  const style: CSSProperties = {
    color: data.text ?? (data.shape === "frame" ? "#475569" : "#0f172a"),
    fontSize: data.fontSize ?? 14,
    fontWeight:
      data.bold ||
      data.shape === "frame" ||
      data.shape === "phone" ||
      data.shape === "entity" ||
      data.shape === "uml"
        ? 600
        : 400,
    fontStyle: data.italic ? "italic" : undefined,
    textAlign: data.align ?? (data.shape === "frame" ? "left" : "center"),
  };
  const place = cn(
    "absolute flex overflow-hidden leading-snug",
    SPECIAL.has(data.shape)
      ? titlePlace(data.shape)
      : data.shape === "frame"
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
    if (done.current) return;
    done.current = true;
    setEditingId(null);
    // an idea's box grows with its words, so the map is laid out again
    if (idea) mind!.act(id, "save", draft);
    else if (draft !== data.label) flow.updateNodeData(id, { label: draft });
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
              // an idea keeps what was typed (Esc is "done", as in mind map apps); other shapes undo it
              if (idea) return save();
              done.current = true;
              setDraft(data.label);
              setEditingId(null);
            }
            if (idea && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
              // like a mind map app: Tab adds an idea under this one, Enter one next to it
              e.preventDefault();
              done.current = true;
              mind!.act(id, e.key === "Tab" ? "child" : "sibling", draft);
              return;
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
  const { votes, mind } = useContext(EditorContext);
  const kids = data.shape === "mind" ? (mind?.kids.get(id) ?? 0) : 0;
  const folded = kids > 0 && !!mind?.folded(id);
  const outward = mind?.side.get(id) === "l" ? "-left" : "-right";
  const voteCount = votes?.counts.get(id) ?? 0;
  const votable = !!votes?.open && votes.canVote && data.shape !== "frame" && data.shape !== "phone";
  return (
    <div
      className={cn(
        "diagram-shape group relative h-full w-full",
        data.shape === "text" && selected && "outline-1 outline-sky-400 outline-dashed"
      )}
      onDoubleClick={() =>
        editable && !data.locked && (!SPECIAL.has(data.shape) || TITLED.has(data.shape)) && setEditingId(id)
      }
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
      {SPECIAL.has(data.shape) ? (
        <SpecialBody id={id} data={data} w={w} h={h} editable={editable && !data.locked} />
      ) : (
        <Outline data={data} w={w} h={h} />
      )}
      {(!SPECIAL.has(data.shape) || TITLED.has(data.shape)) && (
        <Label id={id} data={data} editing={editingId === id} editable={editable && !data.locked} />
      )}
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
      {(voteCount > 0 || votable) && (
        <button
          type="button"
          disabled={!votable}
          aria-label={votes?.mine.has(id) ? "Take back your vote" : "Vote for this"}
          aria-pressed={votes?.mine.has(id)}
          onClick={(e) => {
            e.stopPropagation();
            votes?.onVote(id);
          }}
          className={cn(
            "nodrag absolute -right-2 -bottom-2 z-10 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border-2 border-white px-1.5 text-[11px] font-bold shadow transition",
            votes?.mine.has(id) ? "bg-primary text-white" : "bg-white text-slate-700",
            votable && "hover:scale-110",
            votable && !voteCount && !votes?.mine.has(id) && "opacity-0 group-hover:opacity-100"
          )}
        >
          <ThumbsUp className="h-3 w-3" />
          {voteCount > 0 && voteCount}
        </button>
      )}
      {kids > 0 && (
        <button
          type="button"
          aria-label={folded ? `Show ${kids} hidden idea${kids === 1 ? "" : "s"}` : "Fold this branch"}
          aria-expanded={!folded}
          onClick={(e) => {
            e.stopPropagation();
            mind?.act(id, "fold");
          }}
          className={cn(
            "nodrag absolute top-1/2 z-10 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white px-1 text-[10px] font-bold shadow-sm transition",
            outward === "-left" ? "-left-2.5" : "-right-2.5",
            !folded && !selected && "opacity-0 group-hover:opacity-100"
          )}
          style={{ borderColor: data.stroke, color: data.text }}
        >
          {folded ? kids : <Minus className="h-3 w-3" />}
        </button>
      )}
      {data.shape === "mind" && mind && editable && selected && editingId !== id && (
        <button
          type="button"
          aria-label="Add an idea under this one"
          title="Add an idea under this one (Tab)"
          onClick={(e) => {
            e.stopPropagation();
            mind.act(id, "child");
          }}
          className={cn(
            "nodrag absolute top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-sky-500 text-white shadow transition hover:scale-110",
            outward === "-left" ? (kids ? "-left-10" : "-left-8") : kids ? "-right-10" : "-right-8"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      {!!comments && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950 shadow">
          {comments}
        </span>
      )}
      {data.shape !== "frame" &&
        data.shape !== "phone" &&
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
