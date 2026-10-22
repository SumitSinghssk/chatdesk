"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { mediaApi } from "@/app/admin/_lib/api/mediaApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn } from "@/lib/utils";

import Button from "./Button";
import { Field } from "./Field";

export function ImageField({
  label,
  value,
  onChange,
  folder = "general",
  hint,
  error,
  aspect = "aspect-video",
  className,
}: {
  label?: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  folder?: string;
  hint?: string;
  error?: string;
  aspect?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploading(true);
    try {
      const media = await mediaApi.upload(file, folder);
      onChange(media.url);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Field
      label={label}
      hint={hint ?? "JPG, PNG, WEBP or GIF up to 10 MB"}
      error={error}
      className={className}
    >
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {value ? (
        <div
          className={cn("media-checker group border-line relative overflow-hidden rounded-xl border", aspect)}
        >
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              size="sm"
              variant="secondary"
              className="border-0"
              loading={uploading}
              onClick={() => input.current?.click()}
            >
              Replace
            </Button>
            <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => onChange(null)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "border-line-strong bg-page text-fg-subtle hover:border-primary hover:bg-primary-soft/40 hover:text-primary flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs font-medium transition",
            aspect
          )}
        >
          {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
          {uploading ? "Uploading…" : "Click or drop an image"}
        </button>
      )}
    </Field>
  );
}
