"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { CheckCheck, ImageIcon, Mic, Smile, Video, Phone as PhoneIcon } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

import { cn } from "@/lib/utils";

import type { ShapeData, ShapeKind } from "./model";

/** Shapes drawn with HTML rather than an outline: chat bubbles, phones, tables, icons, pictures… */
export const SPECIAL = new Set<ShapeKind>([
  "bubble-out",
  "bubble-in",
  "phone",
  "table",
  "entity",
  "uml",
  "mind",
  "icon",
  "image",
]);

/** Shapes whose title is typed straight on the canvas (tables and pictures have no title). */
export const TITLED = new Set<ShapeKind>([
  "bubble-out",
  "bubble-in",
  "phone",
  "entity",
  "uml",
  "mind",
  "icon",
]);

const KNOWN = new Set<string>(iconNames);
export const isIcon = (name: string | undefined): name is IconName => !!name && KNOWN.has(name);

const lines = (text: string | undefined) => (text ?? "").split("\n").filter((l) => l.trim());

function Bubble({ data, out }: { data: ShapeData; out: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 rounded-lg shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]",
        out ? "rounded-tr-none" : "rounded-tl-none"
      )}
      style={{ background: data.fill }}
    >
      <svg
        className={cn("absolute top-0", out ? "-right-2" : "-left-2 -scale-x-100")}
        width="8"
        height="13"
        viewBox="0 0 8 13"
        aria-hidden
      >
        <path d="M0 0 L8 0 L0 12 Z" fill={data.fill} />
      </svg>
      <span className="absolute right-2 bottom-1 flex items-center gap-0.5 text-[10.5px] text-[#667781]">
        {data.time}
        {out && <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-label="Read" />}
      </span>
    </div>
  );
}

function PhoneFrame({ data }: { data: ShapeData }) {
  return (
    <div
      className="absolute inset-0 rounded-[34px] p-[9px] shadow-xl"
      style={{ background: data.stroke ?? "#111827" }}
    >
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-[26px]"
        style={{ background: data.fill ?? "#efeae2" }}
      >
        <div className="flex h-[62px] shrink-0 items-end gap-2 bg-[#008069] px-3 pb-2 text-white">
          <span className="mb-0.5 h-8 w-8 shrink-0 rounded-full bg-white/30" />
          <span className="min-w-0 flex-1" />
          <Video className="mb-1.5 h-4 w-4 opacity-90" />
          <PhoneIcon className="mb-1.5 h-4 w-4 opacity-90" />
        </div>
        <div
          className="min-h-0 flex-1 opacity-60"
          style={{
            backgroundImage: "radial-gradient(rgb(0 0 0 / 0.05) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
          }}
        />
        <div className="flex shrink-0 items-center gap-1.5 p-2">
          <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 text-xs text-[#667781]">
            <Smile className="h-4 w-4" /> Message
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
            <Mic className="h-4 w-4" />
          </span>
        </div>
      </div>
      <span className="absolute top-[14px] left-1/2 h-[14px] w-20 -translate-x-1/2 rounded-full bg-black/80" />
    </div>
  );
}

function Table({ id, data, editable }: { id: string; data: ShapeData; editable: boolean }) {
  const flow = useReactFlow();
  const [cell, setCell] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState("");
  const rows = data.rows?.length ? data.rows : [[""]];
  const border = data.stroke ?? "#cbd5e1";
  const save = () => {
    if (!cell) return;
    const [r, c] = cell;
    setCell(null);
    if ((rows[r]?.[c] ?? "") === draft) return;
    flow.updateNodeData(id, {
      rows: rows.map((row, i) => (i === r ? row.map((v, j) => (j === c ? draft : v)) : row)),
    });
  };
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-md border bg-white"
      style={{ borderColor: border }}
    >
      <table
        className="h-full w-full table-fixed border-collapse"
        style={{ fontSize: data.fontSize ?? 13, color: data.text ?? "#0f172a" }}
      >
        <tbody>
          {rows.map((row, r) => {
            const head = r === 0 && data.header !== false;
            return (
              <tr key={r} style={head ? { background: data.fill ?? "#f1f5f9" } : undefined}>
                {row.map((value, c) => (
                  <td
                    key={c}
                    className={cn("border px-2 py-1 align-middle", head && "font-semibold")}
                    style={{ borderColor: border }}
                    onDoubleClick={(e) => {
                      if (!editable) return;
                      e.stopPropagation();
                      setDraft(value);
                      setCell([r, c]);
                    }}
                  >
                    {cell && cell[0] === r && cell[1] === c ? (
                      <input
                        autoFocus
                        value={draft}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={save}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") save();
                          if (e.key === "Escape") setCell(null);
                          if (e.key === "Tab") {
                            e.preventDefault();
                            save();
                            const next: [number, number] = c + 1 < row.length ? [r, c + 1] : [r + 1, 0];
                            if (next[0] < rows.length) {
                              setDraft(rows[next[0]][next[1]] ?? "");
                              setCell(next);
                            }
                          }
                        }}
                        className="nodrag w-full bg-transparent outline-none"
                      />
                    ) : (
                      <span className="block truncate">{value || " "}</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Entity({ data }: { data: ShapeData }) {
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-md border bg-white"
      style={{ borderColor: data.stroke }}
    >
      <div className="h-8 shrink-0" style={{ background: data.fill }} />
      <div className="min-h-0 flex-1 overflow-hidden" style={{ fontSize: data.fontSize ?? 13 }}>
        {lines(data.fields).map((line, i) => {
          const [name, type, key] = line.trim().split(/\s{2,}|\t/);
          return (
            <div
              key={i}
              className="flex h-6 items-center gap-2 border-t border-slate-200 px-2 text-slate-800"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              <span className="text-slate-500">{type}</span>
              {key && (
                <span
                  className={cn(
                    "rounded px-1 text-[10px] font-bold",
                    /^pk/i.test(key) ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                  )}
                >
                  {key.toUpperCase()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Uml({ data }: { data: ShapeData }) {
  const section = (text: string | undefined) => (
    <div className="space-y-0.5 border-t px-2 py-1.5 font-mono" style={{ borderColor: data.stroke }}>
      {lines(text).map((l, i) => (
        <div key={i} className="truncate">
          {l}
        </div>
      ))}
      {!lines(text).length && <div className="opacity-40">—</div>}
    </div>
  );
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-sm border-2"
      style={{
        borderColor: data.stroke,
        background: data.fill,
        color: data.text,
        fontSize: (data.fontSize ?? 13) - 1,
      }}
    >
      <div className="h-8 shrink-0" />
      {section(data.fields)}
      {section(data.methods)}
    </div>
  );
}

function Icon({ data, w, h }: { data: ShapeData; w: number; h: number }) {
  const size = Math.max(16, Math.min(w, h - (data.label ? 22 : 0)) * 0.72);
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center justify-center"
      style={{ bottom: data.label ? 22 : 0 }}
    >
      {data.fill && (
        <span
          className="absolute rounded-2xl"
          style={{ background: data.fill, width: size * 1.3, height: size * 1.3 }}
        />
      )}
      {isIcon(data.icon) ? (
        <DynamicIcon
          name={data.icon}
          size={size}
          color={data.text ?? "#334155"}
          strokeWidth={1.75}
          className="relative"
        />
      ) : (
        <span className="relative text-xs text-slate-400">?</span>
      )}
    </div>
  );
}

function Picture({ data }: { data: ShapeData }) {
  if (!data.src) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
        <ImageIcon className="h-6 w-6" /> No picture yet
      </div>
    );
  }
  return (
    <img
      src={data.src}
      alt={data.label || "Picture"}
      draggable={false}
      crossOrigin="anonymous"
      className="pointer-events-none absolute inset-0 h-full w-full rounded-sm select-none"
      style={{ objectFit: data.fit ?? "contain" }}
    />
  );
}

export function SpecialBody({
  id,
  data,
  w,
  h,
  editable,
}: {
  id: string;
  data: ShapeData;
  w: number;
  h: number;
  editable: boolean;
}) {
  switch (data.shape) {
    case "bubble-out":
    case "bubble-in":
      return <Bubble data={data} out={data.shape === "bubble-out"} />;
    case "phone":
      return <PhoneFrame data={data} />;
    case "table":
      return <Table id={id} data={data} editable={editable} />;
    case "entity":
      return <Entity data={data} />;
    case "uml":
      return <Uml data={data} />;
    case "mind":
      return (
        <div
          className="absolute inset-0 rounded-full border-2 shadow-sm"
          style={{ background: data.fill, borderColor: data.stroke }}
        />
      );
    case "icon":
      return <Icon data={data} w={w} h={h} />;
    case "image":
      return <Picture data={data} />;
    default:
      return null;
  }
}

/** Where a special shape's title sits. */
export function titlePlace(shape: ShapeKind) {
  switch (shape) {
    case "bubble-out":
    case "bubble-in":
      return "left-2.5 right-2.5 top-1.5 bottom-5 items-start";
    case "phone":
      return "left-[60px] right-[70px] top-[34px] h-7 items-center";
    case "entity":
    case "uml":
      return "inset-x-2 top-0 h-8 items-center justify-center";
    case "icon":
      return "inset-x-0 bottom-0 h-[22px] items-center justify-center";
    default:
      return "inset-x-3 inset-y-1 items-center justify-center";
  }
}
