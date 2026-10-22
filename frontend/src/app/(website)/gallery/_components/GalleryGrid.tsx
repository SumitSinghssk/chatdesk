"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";

import type { GalleryDetail } from "@/app/(website)/_lib/websiteApi";

type Item = GalleryDetail["items"][number];

export function GalleryGrid({ items, title }: { items: Item[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i === null ? i : (i + dir + items.length) % items.length)),
    [items.length]
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, close, step]);

  const active = index !== null ? items[index] : null;

  return (
    <>
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndex(i)}
            className="group bg-page focus-visible:ring-primary/40 relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-xl focus-visible:ring-3 focus-visible:outline-none"
            aria-label={`Open ${item.title || (item.type === "youtube" ? "video" : "photo")} ${i + 1}`}
          >
            <img
              src={item.thumbnail ?? ""}
              alt={item.title || item.caption || `${title} – ${i + 1}`}
              loading="lazy"
              className="w-full transition duration-300 group-hover:scale-[1.03]"
            />
            {item.type === "youtube" && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg">
                  <Play className="ml-1 h-6 w-6 fill-current" />
                </span>
              </span>
            )}
            {item.title && (
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-3 text-left text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">
                {item.title}
              </span>
            )}
          </button>
        ))}
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Media viewer"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
          {items.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white sm:left-6"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white sm:right-6"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
          <figure className="max-h-full w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {active.type === "youtube" ? (
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${active.youtube_id}?autoplay=1`}
                  title={active.title || "Video"}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full rounded-lg"
                />
              </div>
            ) : (
              <img
                src={active.path ?? ""}
                alt={active.title || title}
                className="mx-auto max-h-[80vh] rounded-lg object-contain"
              />
            )}
            {(active.title || active.caption) && (
              <figcaption className="mt-3 text-center text-sm text-white/80">
                {active.title && <span className="font-semibold text-white">{active.title}</span>}
                {active.caption && <span className="block">{active.caption}</span>}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
