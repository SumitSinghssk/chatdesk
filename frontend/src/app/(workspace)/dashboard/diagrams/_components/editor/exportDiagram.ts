/**
 * Export a diagram as a real SVG (vector shapes and text, built from the diagram itself, not a screenshot),
 * a sharp PNG drawn from that SVG, or a PDF: one page when it fits, an overview plus readable pages when
 * it's large. Pictures and icons are embedded, so the files look the same anywhere.
 */
import { createElement, type ComponentType, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";
import { CheckCheck, Mic, Phone, Smile, Video, type LucideProps } from "lucide-react";
import { dynamicIconImports } from "lucide-react/dynamic";

import { BEHIND, LINE_COLORS, type LineData, type ShapeData } from "./model";
import { Outline } from "./Shape";
import type { RecordCard } from "../../../_lib/diagramsApi";
import { cardText, RECORD_TYPES } from "./Records";
import { isIcon, SPECIAL } from "./Special";

const FONT = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace";
const PAD = 40;
const SLATE = "#0f172a";

type Box = { x: number; y: number; w: number; h: number };

// Small helpers ---------------------------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Math.round(v * 100) / 100;

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number, weight = 400, family = FONT) {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.55;
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width;
}

/** Breaks text into lines that fit `width` (long words are cut). */
function wrap(text: string, width: number, size: number, weight = 400, family = FONT) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (measure(next, size, weight, family) <= width || !line.trim()) {
        if (measure(next, size, weight, family) > width && !/\s/.test(word)) {
          // a single word wider than the box: cut it
          let part = line;
          for (const ch of word) {
            if (measure(part + ch, size, weight, family) > width && part) {
              out.push(part);
              part = "";
            }
            part += ch;
          }
          line = part;
        } else line = next;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function fit(text: string, width: number, size: number, weight = 400, family = FONT) {
  if (measure(text, size, weight, family) <= width) return text;
  let cut = text;
  while (cut && measure(cut + "…", size, weight, family) > width) cut = cut.slice(0, -1);
  return cut + "…";
}

interface TextOpts {
  size: number;
  color: string;
  weight?: number;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  family?: string;
  lineHeight?: number;
}

/** Wrapped text inside a box; what doesn't fit ends with "…". */
function textBox(text: string, box: Box, o: TextOpts) {
  if (!text.trim() || box.w <= 4 || box.h <= 4) return "";
  const weight = o.weight ?? 400;
  const family = o.family ?? FONT;
  const lh = o.size * (o.lineHeight ?? 1.3);
  let lines = wrap(text, box.w, o.size, weight, family);
  const max = Math.max(1, Math.floor(box.h / lh));
  if (lines.length > max) {
    lines = lines.slice(0, max);
    lines[max - 1] = fit(lines[max - 1] + "…", box.w, o.size, weight, family);
  }
  const total = lines.length * lh;
  const top =
    o.valign === "top" ? box.y : o.valign === "bottom" ? box.y + box.h - total : box.y + (box.h - total) / 2;
  const align = o.align ?? "center";
  const x = align === "left" ? box.x : align === "right" ? box.x + box.w : box.x + box.w / 2;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const spans = lines
    .map((l, i) => `<tspan x="${n(x)}" y="${n(top + i * lh + o.size * 0.95)}">${esc(l) || " "}</tspan>`)
    .join("");
  return `<text font-family="${esc(family)}" font-size="${o.size}" font-weight="${weight}"${o.italic ? ' font-style="italic"' : ""} fill="${o.color}" text-anchor="${anchor}">${spans}</text>`;
}

/** The markup a small React component (an outline, an icon) draws. */
function markup(el: ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(el));
  const html = host.innerHTML;
  root.unmount();
  return html.replace(/ class="[^"]*"/g, "").replace(/ aria-hidden="true"/g, "");
}

/** Places a drawn <svg> at x, y (and size). */
function place(svg: string, x: number, y: number, w?: number, h?: number) {
  return svg.replace(
    /^<svg/,
    `<svg x="${n(x)}" y="${n(y)}"${w ? ` width="${n(w)}"` : ""}${h ? ` height="${n(h)}"` : ""}`
  );
}

async function dataUrl(src: string) {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src, { credentials: "same-origin" });
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Shapes ------------------------------------------------------------------------------------------------------

const size = (node: Node) => ({
  w: node.width ?? node.measured?.width ?? 160,
  h: node.height ?? node.measured?.height ?? 64,
});

/** Where a plain shape's text sits (the same insets as on the canvas). */
function labelBox(d: ShapeData, w: number, h: number): Box & { valign: TextOpts["valign"] } {
  switch (d.shape) {
    case "frame":
      return { x: 12, y: 8, w: w - 24, h: Math.min(40, h - 8), valign: "top" };
    case "person":
      return { x: 0, y: h * 0.74, w, h: h * 0.26, valign: "middle" };
    case "decision":
    case "circle":
      return { x: w * 0.18, y: h * 0.18, w: w * 0.64, h: h * 0.64, valign: "middle" };
    case "io":
    case "hexagon":
      return { x: w * 0.14, y: 4, w: w * 0.72, h: h - 8, valign: "middle" };
    case "database":
      return { x: 8, y: h * 0.22, w: w - 16, h: h * 0.78 - 8, valign: "middle" };
    default:
      return { x: 8, y: 4, w: w - 16, h: h - 8, valign: "middle" };
  }
}

function plain(d: ShapeData, w: number, h: number) {
  const outline = place(markup(createElement(Outline, { data: d, w, h })), 0, 0);
  const box = labelBox(d, w, h);
  const text = textBox(d.label ?? "", box, {
    size: d.fontSize ?? 14,
    color: d.text ?? (d.shape === "frame" ? "#475569" : SLATE),
    weight: d.bold || d.shape === "frame" ? 600 : 400,
    italic: d.italic,
    align: d.align ?? (d.shape === "frame" ? "left" : "center"),
    valign: box.valign,
  });
  return outline + text;
}

type IconComponent = ComponentType<LucideProps>;

const icon = (Comp: IconComponent, px: number, color: string, x: number, y: number) =>
  place(markup(createElement(Comp, { size: px, color, strokeWidth: 1.75 })), x, y);

async function special(id: string, d: ShapeData, w: number, h: number, icons: Map<string, IconComponent>) {
  const size = d.fontSize ?? 14;
  switch (d.shape) {
    case "bubble-out":
    case "bubble-in": {
      const out = d.shape === "bubble-out";
      const tail = out ? `M${w} 0 L${w + 8} 0 L${w} 12 Z` : `M0 0 L-8 0 L0 12 Z`;
      const r = 8;
      const body = out
        ? `M0 ${r} Q0 0 ${r} 0 L${w} 0 L${w} ${h - r} Q${w} ${h} ${w - r} ${h} L${r} ${h} Q0 ${h} 0 ${h - r} Z`
        : `M0 0 L${w - r} 0 Q${w} 0 ${w} ${r} L${w} ${h - r} Q${w} ${h} ${w - r} ${h} L${r} ${h} Q0 ${h} 0 ${h - r} Z`;
      const time = d.time
        ? `<text x="${n(w - (out ? 26 : 8))}" y="${n(h - 6)}" font-family="${esc(FONT)}" font-size="10.5" fill="#667781" text-anchor="end">${esc(d.time)}</text>`
        : "";
      const ticks = out ? icon(CheckCheck, 14, "#53bdeb", w - 22, h - 16) : "";
      return `<path d="${body}" fill="${d.fill}" stroke="rgba(11,20,26,0.08)"/><path d="${tail}" fill="${d.fill}"/>${textBox(d.label, { x: 10, y: 6, w: w - 20, h: h - 24 }, { size, color: d.text ?? "#111b21", align: d.align ?? "left", valign: "top" })}${time}${ticks}`;
    }
    case "phone": {
      const clip = `clip-${id.replace(/[^\w-]/g, "")}`;
      const sx = 9;
      return `<defs><clipPath id="${clip}"><rect x="${sx}" y="${sx}" width="${n(w - sx * 2)}" height="${n(h - sx * 2)}" rx="26"/></clipPath></defs>
<rect width="${n(w)}" height="${n(h)}" rx="34" fill="${d.stroke ?? "#111827"}"/>
<g clip-path="url(#${clip})"><rect x="${sx}" y="${sx}" width="${n(w - sx * 2)}" height="${n(h - sx * 2)}" fill="${d.fill ?? "#efeae2"}"/>
<rect x="${sx}" y="${sx}" width="${n(w - sx * 2)}" height="62" fill="#008069"/>
<circle cx="${sx + 28}" cy="${sx + 44}" r="16" fill="rgba(255,255,255,0.3)"/>
${icon(Video, 16, "#ffffff", w - sx - 52, sx + 36)}${icon(Phone, 16, "#ffffff", w - sx - 28, sx + 36)}
<rect x="${sx + 8}" y="${n(h - sx - 46)}" width="${n(w - sx * 2 - 62)}" height="36" rx="18" fill="#ffffff"/>
${icon(Smile, 16, "#667781", sx + 20, h - sx - 36)}<text x="${sx + 42}" y="${n(h - sx - 23)}" font-family="${esc(FONT)}" font-size="12" fill="#667781">Message</text>
<circle cx="${n(w - sx - 26)}" cy="${n(h - sx - 28)}" r="18" fill="#00a884"/>${icon(Mic, 16, "#ffffff", w - sx - 34, h - sx - 36)}</g>
<rect x="${n(w / 2 - 40)}" y="14" width="80" height="14" rx="7" fill="rgba(0,0,0,0.8)"/>
${textBox(d.label, { x: 60, y: sx + 26, w: w - 130, h: 30 }, { size, color: d.text ?? "#ffffff", weight: 600, align: "left", valign: "middle" })}`;
    }
    case "table": {
      const rows = d.rows?.length ? d.rows : [[""]];
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const rh = h / rows.length;
      const cw = w / cols;
      const border = d.stroke ?? "#cbd5e1";
      let out = `<rect width="${n(w)}" height="${n(h)}" rx="6" fill="#ffffff" stroke="${border}"/>`;
      if (d.header !== false)
        out += `<path d="M1 ${n(rh)} L1 6 Q1 1 6 1 L${n(w - 6)} 1 Q${n(w - 1)} 1 ${n(w - 1)} 6 L${n(w - 1)} ${n(rh)} Z" fill="${d.fill ?? "#f1f5f9"}"/>`;
      for (let i = 1; i < rows.length; i++)
        out += `<line x1="0" x2="${n(w)}" y1="${n(i * rh)}" y2="${n(i * rh)}" stroke="${border}"/>`;
      for (let j = 1; j < cols; j++)
        out += `<line y1="0" y2="${n(h)}" x1="${n(j * cw)}" x2="${n(j * cw)}" stroke="${border}"/>`;
      const fs = d.fontSize ?? 13;
      rows.forEach((row, i) =>
        row.forEach((cell, j) => {
          if (!cell) return;
          const head = i === 0 && d.header !== false;
          out += `<text x="${n(j * cw + 8)}" y="${n(i * rh + rh / 2 + fs * 0.35)}" font-family="${esc(FONT)}" font-size="${fs}" font-weight="${head ? 600 : 400}" fill="${d.text ?? SLATE}">${esc(fit(cell, cw - 16, fs, head ? 600 : 400))}</text>`;
        })
      );
      return out;
    }
    case "entity": {
      const fs = d.fontSize ?? 13;
      let out = `<rect width="${n(w)}" height="${n(h)}" rx="6" fill="#ffffff" stroke="${d.stroke}"/><path d="M0 32 L0 6 Q0 0 6 0 L${n(w - 6)} 0 Q${n(w)} 0 ${n(w)} 6 L${n(w)} 32 Z" fill="${d.fill}"/>`;
      out += textBox(
        d.label,
        { x: 8, y: 0, w: w - 16, h: 32 },
        { size: fs, color: d.text ?? SLATE, weight: 600 }
      );
      (d.fields ?? "")
        .split("\n")
        .filter((l) => l.trim())
        .forEach((line, i) => {
          const y = 32 + i * 24;
          if (y + 24 > h) return;
          const [name, type, key] = line.trim().split(/\s{2,}|\t/);
          out += `<line x1="0" x2="${n(w)}" y1="${y}" y2="${y}" stroke="#e2e8f0"/>`;
          out += `<text x="8" y="${y + 16}" font-family="${esc(FONT)}" font-size="${fs}" font-weight="500" fill="#1e293b">${esc(fit(name ?? "", w * 0.5, fs, 500))}</text>`;
          const keyW = key ? measure(key.toUpperCase(), 10, 700) + 8 : 0;
          if (type)
            out += `<text x="${n(w - 8 - (key ? keyW + 6 : 0))}" y="${y + 16}" font-family="${esc(FONT)}" font-size="${fs}" fill="#64748b" text-anchor="end">${esc(type)}</text>`;
          if (key) {
            const pk = /^pk/i.test(key);
            out += `<rect x="${n(w - 8 - keyW)}" y="${y + 5}" width="${n(keyW)}" height="14" rx="3" fill="${pk ? "#fef3c7" : "#e0f2fe"}"/><text x="${n(w - 8 - keyW / 2)}" y="${y + 15.5}" font-family="${esc(FONT)}" font-size="10" font-weight="700" fill="${pk ? "#92400e" : "#075985"}" text-anchor="middle">${esc(key.toUpperCase())}</text>`;
          }
        });
      return out;
    }
    case "uml": {
      const fs = (d.fontSize ?? 13) - 1;
      const lines = (t?: string) => (t ?? "").split("\n").filter((l) => l.trim());
      const fields = lines(d.fields);
      const methods = lines(d.methods);
      const lh = fs * 1.45;
      const split = Math.min(h - 10, 32 + 12 + Math.max(1, fields.length) * lh);
      let out = `<rect x="1" y="1" width="${n(w - 2)}" height="${n(h - 2)}" rx="2" fill="${d.fill}" stroke="${d.stroke}" stroke-width="2"/>`;
      out += `<line x1="1" x2="${n(w - 1)}" y1="32" y2="32" stroke="${d.stroke}" stroke-width="2"/><line x1="1" x2="${n(w - 1)}" y1="${n(split)}" y2="${n(split)}" stroke="${d.stroke}" stroke-width="2"/>`;
      out += textBox(
        d.label,
        { x: 8, y: 0, w: w - 16, h: 32 },
        { size: fs + 1, color: d.text ?? SLATE, weight: 600 }
      );
      const list = (items: string[], top: number) =>
        items
          .map(
            (l, i) =>
              `<text x="8" y="${n(top + 6 + (i + 1) * lh - fs * 0.3)}" font-family="${esc(MONO)}" font-size="${fs}" fill="${d.text ?? SLATE}">${esc(fit(l, w - 16, fs, 400, MONO))}</text>`
          )
          .join("");
      return (
        out +
        list(fields, 32) +
        list(
          methods.filter((_, i) => split + 6 + (i + 1) * lh < h),
          split
        )
      );
    }
    case "mind":
      return `<rect x="1" y="1" width="${n(w - 2)}" height="${n(h - 2)}" rx="${n((h - 2) / 2)}" fill="${d.fill}" stroke="${d.stroke}" stroke-width="2"/>${textBox(d.label, { x: 12, y: 4, w: w - 24, h: h - 8 }, { size, color: d.text ?? SLATE, weight: d.bold ? 600 : 400, italic: d.italic })}`;
    case "icon": {
      const labelH = d.label ? 22 : 0;
      const px = Math.max(16, Math.min(w, h - labelH) * 0.72);
      const cx = w / 2;
      const cy = (h - labelH) / 2;
      let out = d.fill
        ? `<rect x="${n(cx - px * 0.65)}" y="${n(cy - px * 0.65)}" width="${n(px * 1.3)}" height="${n(px * 1.3)}" rx="16" fill="${d.fill}"/>`
        : "";
      const Comp = d.icon ? icons.get(d.icon) : null;
      if (Comp) out += icon(Comp, px, d.text ?? "#334155", cx - px / 2, cy - px / 2);
      if (d.label)
        out += textBox(
          d.label,
          { x: 0, y: h - labelH, w, h: labelH },
          { size: d.fontSize ?? 12, color: d.text ?? "#334155" }
        );
      return out;
    }
    case "image": {
      if (!d.src)
        return `<rect width="${n(w)}" height="${n(h)}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="6 4"/>`;
      try {
        const href = await dataUrl(d.src);
        const ratio = d.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
        const clip = `img-${id.replace(/[^\w-]/g, "")}`;
        return `<defs><clipPath id="${clip}"><rect width="${n(w)}" height="${n(h)}" rx="2"/></clipPath></defs><image href="${href}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="${ratio}" clip-path="url(#${clip})"/>`;
      } catch {
        return `<rect width="${n(w)}" height="${n(h)}" fill="#f1f5f9"/>`;
      }
    }
    case "record": {
      // `card`: what the card showed when the download was made (added by the canvas)
      const kind = RECORD_TYPES.find((t) => t.type === d.record?.type) ?? RECORD_TYPES[0];
      const text = cardText(d.card as RecordCard | undefined, kind.type);
      let out = `<rect x="0.5" y="0.5" width="${n(w - 1)}" height="${n(h - 1)}" rx="12" fill="#ffffff" stroke="#e2e8f0"/>`;
      out += `<path d="M0 12 Q0 0 12 0 L${n(w - 12)} 0 Q${n(w)} 0 ${n(w)} 12 L${n(w)} 3 L0 3 Z" fill="${kind.color}"/>`;
      out += `<circle cx="26" cy="26" r="14" fill="${kind.color}"/>${icon(kind.icon, 14, "#ffffff", 19, 19)}`;
      const badgeW = text.badge ? measure(text.badge, 10, 600) + 12 : 0;
      out += `<text x="48" y="25" font-family="${esc(FONT)}" font-size="13" font-weight="600" fill="${SLATE}">${esc(fit(text.title, w - 60 - badgeW, 13, 600))}</text>`;
      out += `<text x="48" y="38" font-family="${esc(FONT)}" font-size="10.5" fill="#94a3b8">${esc(kind.label)}</text>`;
      if (text.badge)
        out += `<rect x="${n(w - 10 - badgeW)}" y="14" width="${n(badgeW)}" height="17" rx="8.5" fill="#f1f5f9"/><text x="${n(w - 10 - badgeW / 2)}" y="26" font-family="${esc(FONT)}" font-size="10" font-weight="600" fill="#475569" text-anchor="middle">${esc(text.badge)}</text>`;
      text.lines.slice(0, Math.max(0, Math.floor((h - 52) / 16))).forEach((l, i) => {
        out += `<text x="12" y="${n(62 + i * 16)}" font-family="${esc(FONT)}" font-size="11.5" fill="#475569">${esc(fit(l, w - 24, 11.5))}</text>`;
      });
      return out;
    }
    default:
      return "";
  }
}

// Lines -------------------------------------------------------------------------------------------------------------

const SIDE: Record<string, Position> = {
  t: Position.Top,
  r: Position.Right,
  b: Position.Bottom,
  l: Position.Left,
};

function anchor(node: Node, side: Position) {
  const { w, h } = size(node);
  const { x, y } = node.position;
  if (side === Position.Top) return { x: x + w / 2, y };
  if (side === Position.Bottom) return { x: x + w / 2, y: y + h };
  if (side === Position.Left) return { x, y: y + h / 2 };
  return { x: x + w, y: y + h / 2 };
}

/** The side facing the other shape, when a line wasn't drawn from a particular dot. */
function facing(from: Node, to: Node) {
  const a = size(from);
  const b = size(to);
  const dx = to.position.x + b.w / 2 - (from.position.x + a.w / 2);
  const dy = to.position.y + b.h / 2 - (from.position.y + a.h / 2);
  return Math.abs(dx) > Math.abs(dy)
    ? dx > 0
      ? Position.Right
      : Position.Left
    : dy > 0
      ? Position.Bottom
      : Position.Top;
}

function line(edge: Edge, byId: Map<string, Node>, markers: Set<string>) {
  const s = byId.get(edge.source);
  const t = byId.get(edge.target);
  if (!s || !t) return { svg: "", box: null as Box | null };
  const data = (edge.data ?? {}) as LineData;
  const sp = (edge.sourceHandle && SIDE[edge.sourceHandle]) || facing(s, t);
  const tp = (edge.targetHandle && SIDE[edge.targetHandle]) || facing(t, s);
  const a = anchor(s, sp);
  const b = anchor(t, tp);
  const args = {
    sourceX: a.x,
    sourceY: a.y,
    targetX: b.x,
    targetY: b.y,
    sourcePosition: sp,
    targetPosition: tp,
  };
  const [path, lx, ly] =
    data.path === "straight"
      ? getStraightPath(args)
      : data.path === "curve"
        ? getBezierPath(args)
        : getSmoothStepPath({ ...args, borderRadius: data.path === "step" ? 0 : 10 });
  const color = data.color ?? LINE_COLORS[0];
  const width = data.width ?? 1.75;
  const key = color.replace("#", "");
  markers.add(color);
  let svg = `<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}"${data.dashed ? ` stroke-dasharray="${width * 4} ${width * 3}"` : ""}${data.arrowEnd === false ? "" : ` marker-end="url(#arrow-${key})"`}${data.arrowStart ? ` marker-start="url(#arrow-${key})"` : ""}/>`;
  let box: Box | null = null;
  if (data.label) {
    const tw = Math.min(190, measure(data.label, 12, 500)) + 12;
    box = { x: lx - tw / 2, y: ly - 11, w: tw, h: 22 };
    svg += `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(tw)}" height="22" rx="6" fill="#ffffff" stroke="#e2e8f0"/><text x="${n(lx)}" y="${n(ly + 4.2)}" font-family="${esc(FONT)}" font-size="12" font-weight="500" fill="${SLATE}" text-anchor="middle">${esc(fit(data.label, 184, 12, 500))}</text>`;
  }
  return { svg, box };
}

// The whole diagram ---------------------------------------------------------------------------------------------------------

export interface Drawing {
  svg: string;
  width: number;
  height: number;
  /** the diagram point at the drawing's top-left */
  x: number;
  y: number;
}

/** The diagram as a standalone SVG (white background), and its size. */
export async function toSvg(nodes: Node[], edges: Edge[], title: string): Promise<Drawing> {
  if (!nodes.length) throw new Error("There's nothing to export yet");
  const icons = new Map<string, IconComponent>();
  await Promise.all(
    [...new Set(nodes.map((nd) => (nd.data as ShapeData).icon).filter(isIcon))].map(async (name) => {
      const mod = await dynamicIconImports[name]();
      icons.set(name, mod.default as IconComponent);
    })
  );
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const markers = new Set<string>();
  const order = [...nodes].sort((a, b) => {
    const back = (x: Node) => (BEHIND.includes((x.data as ShapeData).shape) ? -1 : 0);
    return back(a) - back(b) || (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
  const behind = order.filter((nd) => BEHIND.includes((nd.data as ShapeData).shape));
  const front = order.filter((nd) => !BEHIND.includes((nd.data as ShapeData).shape));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (b: Box) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  };

  const draw = async (nd: Node) => {
    const d = nd.data as ShapeData;
    const { w, h } = size(nd);
    grow({ x: nd.position.x - 10, y: nd.position.y, w: w + 20, h });
    const body = SPECIAL.has(d.shape) ? await special(nd.id, d, w, h, icons) : plain(d, w, h);
    return `<g transform="translate(${n(nd.position.x)} ${n(nd.position.y)})">${body}</g>`;
  };
  const lines = edges.map((e) => line(e, byId, markers));
  lines.forEach((l) => l.box && grow(l.box));
  const back = (await Promise.all(behind.map(draw))).join("\n");
  const fore = (await Promise.all(front.map(draw))).join("\n");

  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD * 2);
  const defs = [...markers]
    .map(
      (c) =>
        `<marker id="arrow-${c.replace("#", "")}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0 L10 5 L0 10 Z" fill="${c}"/></marker>`
    )
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${n(minX - PAD)} ${n(minY - PAD)} ${width} ${height}">
<title>${esc(title)}</title>
<defs>${defs}</defs>
<rect x="${n(minX - PAD)}" y="${n(minY - PAD)}" width="${width}" height="${height}" fill="#ffffff"/>
${back}
${lines.map((l) => l.svg).join("\n")}
${fore}
</svg>`;
  return { svg, width, height, x: minX - PAD, y: minY - PAD };
}

// PNG and PDF ----------------------------------------------------------------------------------------------------------------

const MAX_SIDE = 16000; // browsers can't draw bigger canvases
const MAX_PIXELS = 48_000_000;

/**
 * Draws (a part of) the drawing on a canvas, `scale` pixels per diagram pixel. Each part is drawn from its own
 * SVG at its final size, so it stays sharp and huge diagrams never need one giant picture.
 */
async function raster(drawing: Drawing, scale: number, crop?: Box) {
  const area = crop ?? { x: 0, y: 0, w: drawing.width, h: drawing.height };
  const width = Math.max(1, Math.round(area.w * scale));
  const height = Math.max(1, Math.round(area.h * scale));
  const open = drawing.svg.indexOf("<svg ");
  const close = drawing.svg.indexOf(">", open);
  const svg =
    drawing.svg.slice(0, open) +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${n(drawing.x + area.x)} ${n(drawing.y + area.y)} ${n(area.w)} ${n(area.h)}">` +
    drawing.svg.slice(close + 1);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The diagram couldn't be drawn"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, width, height);
  c.drawImage(img, 0, 0, width, height);
  return canvas;
}

/** The scale for a sharp PNG that browsers can still make. */
export function pngScale(width: number, height: number) {
  return Math.max(
    0.1,
    Math.min(2, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_PIXELS / (width * height)))
  );
}

const safe = (name: string) =>
  name
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-") || "diagram";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadSvg(nodes: Node[], edges: Edge[], name: string) {
  const drawing = await toSvg(nodes, edges, name);
  save(new Blob([drawing.svg], { type: "image/svg+xml" }), `${safe(name)}.svg`);
}

export async function downloadPng(nodes: Node[], edges: Edge[], name: string) {
  const drawing = await toSvg(nodes, edges, name);
  const canvas = await raster(drawing, pngScale(drawing.width, drawing.height));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The picture is too big for this browser. Try the PDF or SVG.");
  save(blob, `${safe(name)}.png`);
}

const MM_PER_PX = 25.4 / 96;
const READABLE = 0.55; // smallest scale at which 14px text stays easy to read on paper

/**
 * A PDF: the whole diagram on one page when it's readable there; otherwise an overview page, then the
 * diagram cut into pages at a readable size (each with a small map of where it is).
 */
export async function downloadPdf(nodes: Node[], edges: Edge[], name: string) {
  const { jsPDF } = await import("jspdf");
  const drawing = await toSvg(nodes, edges, name);
  const wide = drawing.width >= drawing.height;
  const pdf = new jsPDF({
    orientation: wide ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const header = 9;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - header;
  const stamp = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const fitScale = Math.min(usableW / (drawing.width * MM_PER_PX), usableH / (drawing.height * MM_PER_PX));

  const title = (page: number, pages: number, note?: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(name.slice(0, 80), margin, margin + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      [note, stamp, pages > 1 ? `Page ${page} of ${pages}` : ""].filter(Boolean).join("   ·   "),
      pageW - margin,
      margin + 4,
      { align: "right" }
    );
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, margin + 6.5, pageW - margin, margin + 6.5);
  };
  const image = async (crop: Box, x: number, y: number, wMm: number, hMm: number) => {
    const dpiScale = Math.min(3, (wMm / MM_PER_PX / crop.w) * 2); // about 2 device pixels per printed pixel
    const canvas = await raster(drawing, Math.max(0.2, Math.min(dpiScale, pngScale(crop.w, crop.h))), crop);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, wMm, hMm, undefined, "FAST");
  };

  const whole = { x: 0, y: 0, w: drawing.width, h: drawing.height };
  if (fitScale >= READABLE) {
    // fits on one page: centred, never bigger than real size
    const s = Math.min(1, fitScale);
    const wMm = drawing.width * MM_PER_PX * s;
    const hMm = drawing.height * MM_PER_PX * s;
    title(1, 1);
    await image(whole, margin + (usableW - wMm) / 2, margin + header + (usableH - hMm) / 2, wMm, hMm);
  } else {
    // too big to read on one page: overview, then pages at a readable size
    const s = READABLE;
    const tileW = usableW / (MM_PER_PX * s); // diagram pixels per page
    const tileH = usableH / (MM_PER_PX * s);
    const overlap = 24;
    const cols = Math.ceil((drawing.width - overlap) / (tileW - overlap));
    const rows = Math.ceil((drawing.height - overlap) / (tileH - overlap));
    const pages = cols * rows + 1;
    // pages spread evenly, so neighbours overlap a little (and the last one isn't mostly a repeat)
    const at = (i: number, count: number, tile: number, total: number) =>
      count > 1 && total > tile ? (i * (total - tile)) / (count - 1) : 0;
    const ow = drawing.width * MM_PER_PX * fitScale;
    const oh = drawing.height * MM_PER_PX * fitScale;
    const ox = margin + (usableW - ow) / 2;
    const oy = margin + header + (usableH - oh) / 2;
    title(1, pages, "Overview");
    await image(whole, ox, oy, ow, oh);
    // the page grid on the overview, numbered
    pdf.setDrawColor(14, 165, 233);
    pdf.setLineWidth(0.2);
    pdf.setFontSize(7);
    pdf.setTextColor(14, 165, 233);
    let page = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = at(c, cols, tileW, drawing.width);
        const y = at(r, rows, tileH, drawing.height);
        const k = MM_PER_PX * fitScale;
        pdf.rect(
          ox + x * k,
          oy + y * k,
          Math.min(tileW, drawing.width) * k,
          Math.min(tileH, drawing.height) * k
        );
        pdf.text(String(page++), ox + x * k + 1.2, oy + y * k + 3);
      }
    }
    page = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = at(c, cols, tileW, drawing.width);
        const y = at(r, rows, tileH, drawing.height);
        const crop = { x, y, w: Math.min(tileW, drawing.width - x), h: Math.min(tileH, drawing.height - y) };
        pdf.addPage("a4", wide ? "landscape" : "portrait");
        title(page, pages, `Part ${page - 1} of ${pages - 1} (row ${r + 1}, column ${c + 1})`);
        await image(crop, margin, margin + header, crop.w * MM_PER_PX * s, crop.h * MM_PER_PX * s);
        page++;
      }
    }
  }
  save(pdf.output("blob"), `${safe(name)}.pdf`);
}
