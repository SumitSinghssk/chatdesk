"use client";

import { useState, type DragEvent } from "react";

export function useDragSort({
  onMove,
  axis = "y",
  disabled,
}: {
  onMove: (from: number, to: number) => void;
  axis?: "x" | "y";
  disabled?: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [over, setOver] = useState<{ index: number; after: boolean } | null>(null);

  const reset = () => {
    setDragIndex(null);
    setOver(null);
  };

  const targetIndex = (target = over) => {
    if (dragIndex === null || !target) return null;
    let to = target.index + (target.after ? 1 : 0);
    if (dragIndex < to) to--;
    return to === dragIndex ? null : to;
  };

  return {
    dragIndex,
    isDragging: (index: number) => dragIndex === index,
    indicator: (index: number): "before" | "after" | null =>
      over?.index === index && targetIndex() !== null ? (over.after ? "after" : "before") : null,

    handleProps: (index: number) => ({
      draggable: !disabled,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        const item = e.currentTarget.closest<HTMLElement>("[data-sort-item]");
        if (item && item !== e.currentTarget) e.dataTransfer.setDragImage(item, 24, 24);
        setDragIndex(index);
      },
      onDragEnd: reset,
    }),

    itemProps: (index: number) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (dragIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const after =
          axis === "x" ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2;
        if (over?.index !== index || over.after !== after) setOver({ index, after });
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        const to = targetIndex();
        if (dragIndex !== null && to !== null) onMove(dragIndex, to);
        reset();
      },
    }),
  };
}
