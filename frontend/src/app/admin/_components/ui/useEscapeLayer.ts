"use client";

import { useEffect, useRef } from "react";

const layers: { id: number; close: () => void }[] = [];
let nextId = 0;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  e.preventDefault();
  top.close();
}

export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const id = ++nextId;
    layers.push({ id, close: () => handler.current() });
    if (layers.length === 1) document.addEventListener("keydown", onKeyDown);
    return () => {
      const index = layers.findIndex((layer) => layer.id === id);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);
}
