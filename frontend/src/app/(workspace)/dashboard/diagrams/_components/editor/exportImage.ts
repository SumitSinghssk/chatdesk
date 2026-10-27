import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

const PAD = 48;

/** The whole diagram as an image (what's off screen too), without cursors, pins or handles. */
async function render(nodes: Node[], format: "png" | "svg", dark: boolean) {
  const viewportEl = document.querySelector<HTMLElement>(".diagram-canvas .react-flow__viewport");
  if (!viewportEl || !nodes.length) throw new Error("There's nothing to export yet");
  const bounds = getNodesBounds(nodes);
  const width = Math.min(6000, Math.ceil(bounds.width + PAD * 2));
  const height = Math.min(6000, Math.ceil(bounds.height + PAD * 2));
  // real size (zoom 1) unless the diagram is huge; the PNG is drawn at twice that for sharp text
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 1, `${PAD}px`);
  const options = {
    backgroundColor: dark ? "#0f172a" : "#ffffff",
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    filter: (el: HTMLElement) =>
      !(el.classList?.contains("diagram-overlay") || el.classList?.contains("react-flow__handle")),
  };
  return format === "png" ? toPng(viewportEl, { ...options, pixelRatio: 2 }) : toSvg(viewportEl, options);
}

const safe = (name: string) =>
  name
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-") || "diagram";

export async function download(nodes: Node[], format: "png" | "svg", name: string, dark: boolean) {
  const url = await render(nodes, format, dark);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe(name)}.${format}`;
  a.click();
}

/** Opens the print dialog with the diagram on its own page ("Save as PDF" there). */
export async function print(nodes: Node[], name: string) {
  const url = await render(nodes, "png", false);
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow pop-ups for this site to print");
  const doc = win.document;
  doc.title = name;
  const style = doc.createElement("style");
  style.textContent =
    "@page{margin:12mm}body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh}";
  const img = doc.createElement("img");
  img.alt = name;
  img.onload = () => {
    win.focus();
    win.print();
  };
  img.src = url;
  doc.head.append(style);
  doc.body.append(img);
}
