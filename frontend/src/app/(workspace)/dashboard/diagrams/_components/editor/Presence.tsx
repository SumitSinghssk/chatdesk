"use client";

import { useStore, ViewportPortal } from "@xyflow/react";

import { cn } from "@/lib/utils";

import type { Person } from "../../../_lib/diagramsApi";
import type { ShapeNode } from "./model";
import type { PeerState } from "./useLive";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

/**
 * Who has the diagram open (one bubble per person, however many tabs). Click someone to follow their view;
 * click them again to stop.
 */
export function Avatars({
  me,
  peers,
  following,
  onFollow,
}: {
  me: Person;
  peers: PeerState[];
  following?: string | null;
  onFollow?: (peerId: string) => void;
}) {
  // per person, the tab they used last (that's the one to follow)
  const people = new Map<string, PeerState>();
  for (const p of peers) {
    const key = p.person.guest ? `g:${p.person.name}` : `m:${p.person.id}`;
    const before = people.get(key);
    if (!before || p.seen > before.seen) people.set(key, p);
  }
  if (!me.guest) people.delete(`m:${me.id}`);
  const others = [...people.values()];
  const shown = others.slice(0, 4);
  const bubble =
    "ring-surface flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2";
  return (
    <div className="flex items-center" aria-label={`${others.length + 1} people here`}>
      <span title={`${me.name} (you)`} className={bubble} style={{ background: me.color }}>
        {initials(me.name)}
      </span>
      {shown.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onFollow?.(p.id)}
          title={`${p.person.name}${p.person.guest ? " (guest)" : ""}: ${following === p.id ? "stop following" : "follow their view"}`}
          aria-label={`${following === p.id ? "Stop following" : "Follow"} ${p.person.name}`}
          aria-pressed={following === p.id}
          className={cn(
            bubble,
            "-ml-1.5 transition hover:z-10 hover:scale-110",
            following === p.id && "ring-primary z-10"
          )}
          style={{ background: p.person.color }}
        >
          {initials(p.person.name)}
        </button>
      ))}
      {others.length > shown.length && (
        <span className="bg-hover text-fg-subtle ring-surface -ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[11px] font-semibold ring-2">
          +{others.length - shown.length}
        </span>
      )}
    </div>
  );
}

/** Other people's cursors and the shapes they're moving, drawn on the canvas. */
export function Cursors({ peers, nodes }: { peers: PeerState[]; nodes: ShapeNode[] }) {
  const zoom = useStore((s) => s.transform[2]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <ViewportPortal>
      {peers.map((p) => (
        <div key={p.id} className="diagram-overlay pointer-events-none">
          {p.drag &&
            Object.entries(p.drag).map(([id, pos]) => {
              const n = byId.get(id);
              if (!n) return null;
              return (
                <div
                  key={id}
                  className="absolute rounded-md border-2 border-dashed"
                  style={{
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    width: n.width ?? 160,
                    height: n.height ?? 64,
                    borderColor: p.person.color,
                    background: `${p.person.color}14`,
                  }}
                />
              );
            })}
          {p.cursor && (
            <div
              className="absolute top-0 left-0 transition-transform duration-75 ease-linear"
              style={{
                transform: `translate(${p.cursor.x}px, ${p.cursor.y}px) scale(${1 / zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden>
                <path
                  d="M1 1 L1 16 L5.5 12 L8.5 19 L11 18 L8 11 L14 11 Z"
                  fill={p.person.color}
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="-mt-1 ml-3 block rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow"
                style={{ background: p.person.color }}
              >
                {p.person.name}
              </span>
            </div>
          )}
        </div>
      ))}
    </ViewportPortal>
  );
}
