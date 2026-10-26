import type { Shot } from "./types";
import sizes from "./shots.json";

/** A screenshot from public/docs/<key>.png (sizes are written by the screenshot script). */
export function shot(key: keyof typeof sizes, alt: string, caption?: string): Shot {
  const { width, height } = sizes[key];
  return { src: `/docs/${key}.png`, alt, caption, width, height };
}
