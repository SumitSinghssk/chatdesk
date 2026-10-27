import type { DiagramContent, DiagramSummary } from "../../_lib/diagramsApi";

type Preview = DiagramSummary["preview"];

/** The same outline the server sends with the list, made from a diagram's content (for templates). */
export function previewOf(content: DiagramContent): Preview {
  return {
    nodes: Object.values(content.nodes).map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: n.width ?? 160,
      h: n.height ?? 64,
      shape: (n.data.shape as string) ?? null,
      fill: (n.data.fill as string) ?? null,
      parent: null,
    })),
    edges: Object.values(content.edges).map((e) => [e.source, e.target] as [string, string]),
  };
}

/** A tiny drawing of a diagram: boxes and the lines between them. */
export function Thumbnail({ preview, className }: { preview: Preview; className?: string }) {
  const nodes = preview.nodes;
  if (!nodes.length) {
    return (
      <svg viewBox="0 0 160 90" className={className} aria-hidden>
        <rect
          x="58"
          y="32"
          width="44"
          height="26"
          rx="5"
          className="fill-none stroke-current opacity-25"
          strokeDasharray="4 3"
        />
      </svg>
    );
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 10;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = (id: string) => {
    const n = byId.get(id);
    return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null;
  };
  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden
    >
      {preview.edges.map(([s, t], i) => {
        const a = center(s);
        const b = center(t);
        return a && b ? (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#94a3b8"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ) : null;
      })}
      {[...nodes]
        .sort((a, b) => (a.shape === "frame" ? -1 : 0) - (b.shape === "frame" ? -1 : 0))
        .map((n) => {
          const fill =
            n.shape === "text" ? "transparent" : n.shape === "frame" ? "transparent" : (n.fill ?? "#dbeafe");
          const stroke = n.shape === "text" ? "transparent" : "#94a3b8";
          const common = { fill, stroke, strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" as const };
          if (n.shape === "decision")
            return (
              <polygon
                key={n.id}
                points={`${n.x + n.w / 2},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w / 2},${n.y + n.h} ${n.x},${n.y + n.h / 2}`}
                {...common}
              />
            );
          if (n.shape === "circle")
            return (
              <ellipse
                key={n.id}
                cx={n.x + n.w / 2}
                cy={n.y + n.h / 2}
                rx={n.w / 2}
                ry={n.h / 2}
                {...common}
              />
            );
          const rx = n.shape === "terminal" ? n.h / 2 : n.shape === "rounded" || n.shape === "frame" ? 12 : 4;
          return (
            <rect
              key={n.id}
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={rx}
              {...common}
              strokeDasharray={n.shape === "frame" ? "6 4" : undefined}
            />
          );
        })}
    </svg>
  );
}
