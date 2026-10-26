"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { commerceApi } from "../../../_lib/commerceApi";

export interface Photo {
  path: string;
  url: string;
}

const MAX = 10;
const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

/** Product photos: upload several, the first one is the main photo; move or remove any. */
export function PhotosField({ photos, onChange }: { photos: Photo[]; onChange: (photos: Photo[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  // the latest list while several uploads finish one after another
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);

  const add = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (list.length < [...files].length) toast.error("Use JPG, PNG or WEBP photos");
    const room = MAX - latest.current.length;
    if (list.length > room) toast.error(`Up to ${MAX} photos per product`);
    const take = list.slice(0, Math.max(0, room));
    setUploading((n) => n + take.length);
    for (const file of take) {
      try {
        const saved = await commerceApi.uploadImage(file);
        onChange([...latest.current, saved]);
        latest.current = [...latest.current, saved];
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const move = (i: number, to: number) => {
    const next = [...photos];
    const [p] = next.splice(i, 1);
    next.splice(to, 0, p);
    onChange(next);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add(e.dataTransfer.files);
  };

  return (
    <div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5" aria-label="Product photos">
        {photos.map((p, i) => (
          <li
            key={p.path}
            className={cn(
              "group border-line bg-page relative aspect-square overflow-hidden rounded-xl border",
              i === 0 && "border-primary ring-primary/20 ring-2"
            )}
          >
            {}
            <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="bg-primary text-primary-fg absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                Main
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-6 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  aria-label={`Move photo ${i + 1} left`}
                  className="rounded-md bg-white/90 p-1 text-slate-800 hover:bg-white"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              )}
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => move(i, 0)}
                  aria-label={`Make photo ${i + 1} the main photo`}
                  title="Make main photo"
                  className="rounded-md bg-white/90 p-1 text-slate-800 hover:bg-white"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              {i < photos.length - 1 && (
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  aria-label={`Move photo ${i + 1} right`}
                  className="rounded-md bg-white/90 p-1 text-slate-800 hover:bg-white"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(photos.filter((x) => x.path !== p.path))}
                aria-label={`Remove photo ${i + 1}`}
                className="rounded-md bg-white/90 p-1 text-red-600 hover:bg-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li
            key={`up-${i}`}
            className="border-line bg-page flex aspect-square items-center justify-center rounded-xl border"
          >
            <Loader2 className="text-fg-faint h-5 w-5 animate-spin" aria-label="Uploading" />
          </li>
        ))}
        {photos.length + uploading < MAX && (
          <li>
            <button
              type="button"
              onClick={() => ref.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={cn(
                "text-fg-subtle hover:text-primary hover:border-primary flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-medium transition",
                over ? "border-primary bg-primary-soft text-primary" : "border-line-strong"
              )}
            >
              <ImagePlus className="h-5 w-5" aria-hidden />
              {photos.length ? "Add photo" : "Add photos"}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        aria-label="Choose product photos"
        onChange={(e) => {
          if (e.target.files) void add(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-fg-faint mt-2 text-xs">
        Square photos look best (at least 500 × 500). The first is the main photo. JPG, PNG or WEBP, up to 10
        MB, {MAX} photos.
      </p>
    </div>
  );
}
