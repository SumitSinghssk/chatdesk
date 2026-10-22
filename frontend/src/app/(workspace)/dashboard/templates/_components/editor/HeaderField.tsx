"use client";

import { useRef, useState } from "react";
import {
  Ban,
  Braces,
  FileText,
  ImageIcon,
  MapPin,
  RefreshCw,
  Trash2,
  Type,
  UploadCloud,
  Video,
} from "lucide-react";

import { Button, ErrorText, Input, Spinner } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { fileSize } from "../../../inbox/_components/format";
import type { HeaderFormat, ParameterFormat } from "../../../_lib/templatesApi";
import { Counter, Segmented } from "./parts";
import { LIMITS, variables } from "./rules";

export interface SampleFile {
  /** Uploaded key; null = the template's saved sample; "template:<id>" = copy another template's */
  key: string | null;
  url: string | null;
  mime: string | null;
  filename: string | null;
  size: number | null;
}

const FORMATS: { value: HeaderFormat; label: string; icon: typeof Ban }[] = [
  { value: "none", label: "None", icon: Ban },
  { value: "text", label: "Text", icon: Type },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "video", label: "Video", icon: Video },
  { value: "document", label: "Document", icon: FileText },
  { value: "location", label: "Location", icon: MapPin },
];

export const SAMPLE_ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png",
  video: "video/mp4",
  document: "application/pdf",
};
const SAMPLE_HINT: Record<string, string> = {
  image: "JPG or PNG, up to 5 MB. A 1.91:1 image (e.g. 1200 × 628) looks best.",
  video: "MP4, up to 16 MB.",
  document: "PDF, up to 100 MB.",
};

export function HeaderField({
  header,
  onChange,
  format,
  sample,
  uploading,
  onUpload,
  onRemoveSample,
  errors,
}: {
  header: { format: HeaderFormat; text: string | null; example: string | null };
  onChange: (header: { format: HeaderFormat; text: string | null; example: string | null }) => void;
  format: ParameterFormat;
  sample: SampleFile | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemoveSample: () => void;
  errors: Record<string, string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const isMedia = ["image", "video", "document"].includes(header.format);
  const names = variables(header.text);

  const addVariable = () => {
    if (names.length) return;
    const token = format === "named" ? "{{name}}" : "{{1}}";
    onChange({
      ...header,
      text: `${header.text ?? ""}${header.text?.endsWith(" ") || !header.text ? "" : " "}${token}`,
    });
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="space-y-4">
      <Segmented
        label="Header type"
        options={FORMATS}
        value={header.format}
        onChange={(f) =>
          onChange({
            format: f,
            text: f === "text" ? header.text : null,
            example: f === "text" ? header.example : null,
          })
        }
      />

      {header.format === "text" && (
        <div className="space-y-3">
          <Input
            name="header_text"
            label="Header text"
            placeholder="Your order is on its way"
            value={header.text ?? ""}
            maxLength={LIMITS.header + 10}
            error={errors["header.text"]}
            onChange={(e) => onChange({ ...header, text: e.target.value })}
            hint={
              <span className="flex justify-between gap-3">
                <span>Bold title above the message. No emoji or formatting.</span>
                <Counter value={header.text} max={LIMITS.header} />
              </span>
            }
            rightAddon={
              !names.length && (
                <button
                  type="button"
                  onClick={addVariable}
                  aria-label="Add a variable to the header"
                  title="Add a variable"
                  className="text-fg-faint hover:text-primary"
                >
                  <Braces className="h-4 w-4" />
                </button>
              )
            }
          />
          {names.length === 1 && (
            <Input
              name="header_example"
              label={<span className="font-mono text-xs">{`Sample for {{${names[0]}}}`}</span>}
              placeholder="Asha"
              value={header.example ?? ""}
              error={errors["header.example"]}
              onChange={(e) => onChange({ ...header, example: e.target.value })}
            />
          )}
        </div>
      )}

      {isMedia && (
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={SAMPLE_ACCEPT[header.format]}
            aria-label={`Upload a sample ${header.format}`}
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
          {sample ? (
            <div className="border-line bg-page flex items-center gap-3 rounded-lg border p-2.5">
              <span className="bg-surface border-line flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {header.format === "image" && sample.url ? (
                  <img src={sample.url} alt="" className="h-full w-full object-cover" />
                ) : header.format === "video" ? (
                  <Video className="text-fg-faint h-6 w-6" />
                ) : (
                  <FileText className="h-6 w-6 text-red-500" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-fg block truncate text-sm font-medium">
                  {sample.filename ?? "Sample file"}
                </span>
                <span className="text-fg-subtle block text-xs">
                  {sample.size ? fileSize(sample.size) : "Saved sample"} · used for Meta&apos;s review and as
                  the default when sending
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={RefreshCw}
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                leftIcon={Trash2}
                aria-label="Remove sample"
                onClick={onRemoveSample}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition",
                errors.sample
                  ? "border-red-300 dark:border-red-500/60"
                  : "border-line-strong/70 hover:border-primary",
                dragging && "border-primary bg-primary-soft"
              )}
            >
              {uploading ? (
                <Spinner className="py-0" />
              ) : (
                <UploadCloud className="text-primary h-7 w-7" aria-hidden />
              )}
              <span className="text-fg text-sm font-medium">
                Upload a sample {header.format === "document" ? "PDF" : header.format}
              </span>
              <span className="text-fg-subtle text-xs">
                {SAMPLE_HINT[header.format]} Drop it here or click.
              </span>
            </button>
          )}
          {errors.sample && <ErrorText message={errors.sample} />}
        </div>
      )}

      {header.format === "location" && (
        <p className="text-fg-subtle bg-page border-line rounded-lg border px-3 py-2.5 text-sm">
          A map pin appears above the message. You choose the exact location each time you send it.
        </p>
      )}
    </div>
  );
}
