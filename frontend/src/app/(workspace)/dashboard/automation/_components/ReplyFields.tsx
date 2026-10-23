"use client";

import { useRef, useState } from "react";
import {
  FileText,
  ImageIcon,
  List,
  MapPin,
  MousePointerClick,
  Plus,
  Trash2,
  Type,
  UploadCloud,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Spinner, Textarea } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import type { PreviewMedia, PreviewTemplate } from "../../_components/whatsapp/TemplatePreview";
import type { Reply, ReplyType } from "../../_lib/automationApi";
import { templatesApi } from "../../_lib/templatesApi";
import { SAMPLE_ACCEPT } from "../../templates/_components/editor/HeaderField";
import { Segmented } from "../../templates/_components/editor/parts";

export const REPLY_TYPES: { value: ReplyType; label: string; icon: typeof Type }[] = [
  { value: "text", label: "Text", icon: Type },
  { value: "buttons", label: "Buttons", icon: MousePointerClick },
  { value: "list", label: "List menu", icon: List },
  { value: "media", label: "Image / PDF / video", icon: ImageIcon },
  { value: "location", label: "Location", icon: MapPin },
];

/** How the reply looks in WhatsApp, for the preview bubble. */
export function previewOf(reply: Reply): { template: PreviewTemplate; media: PreviewMedia | null } {
  const text = reply.text ?? "";
  if (reply.type === "media") {
    return {
      template: {
        header: { format: reply.media_kind ?? "image", text: null },
        body: text,
        footer: null,
        buttons: [],
      },
      media: {
        url: reply.media_key ? templatesApi.sampleUrl(`/customer/templates/media/${reply.media_key}`) : null,
        filename: reply.media_filename,
      },
    };
  }
  if (reply.type === "location") {
    return {
      template: {
        header: { format: "location", text: null },
        body: [reply.place, reply.address].filter(Boolean).join("\n") || "Location",
        footer: null,
        buttons: [],
      },
      media: null,
    };
  }
  return {
    template: {
      header: { format: reply.header ? "text" : "none", text: reply.header ?? null },
      body: text,
      footer: reply.footer ?? null,
      buttons:
        reply.type === "buttons"
          ? (reply.buttons ?? []).filter(Boolean).map((b) => ({ type: "quick_reply", text: b }))
          : reply.type === "list"
            ? [{ type: "list", text: reply.list_button || "Options" }]
            : [],
    },
    media: null,
  };
}

const KIND_OF: Record<string, "image" | "video" | "document"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "video/mp4": "video",
  "application/pdf": "document",
};

export function ReplyFields({
  reply,
  onChange,
  error,
  types,
  hint = "Use {{first_name}} or {{name}} for the person's name, and *bold*, _italic_ like in WhatsApp.",
}: {
  reply: Reply;
  onChange: (r: Reply) => void;
  error?: string;
  /** Limit the reply types offered (all by default). */
  types?: ReplyType[];
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<Reply>) => onChange({ ...reply, ...patch });
  const buttons = reply.buttons ?? [];
  const rows = reply.rows ?? [];

  const upload = async (file: File) => {
    const kind = KIND_OF[file.type];
    if (!kind) {
      toast.error("Choose a JPG or PNG image, an MP4 video or a PDF");
      return;
    }
    setUploading(true);
    try {
      const res = await templatesApi.uploadSample(file, kind);
      set({ media_key: res.key, media_kind: kind, media_filename: res.filename });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Segmented
        label="Reply type"
        value={reply.type}
        onChange={(type) => set({ type })}
        options={types ? REPLY_TYPES.filter((t) => types.includes(t.value)) : REPLY_TYPES}
      />

      {reply.type === "media" && (
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={[SAMPLE_ACCEPT.image, SAMPLE_ACCEPT.video, SAMPLE_ACCEPT.document].join(",")}
            aria-label="Reply file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-line-strong/70 hover:border-primary flex w-full items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-left transition"
          >
            {uploading ? (
              <Spinner className="py-0" />
            ) : reply.media_kind === "document" ? (
              <FileText className="h-6 w-6 shrink-0 text-red-500" />
            ) : reply.media_kind === "video" ? (
              <Video className="text-primary h-6 w-6 shrink-0" />
            ) : reply.media_key ? (
              <ImageIcon className="text-primary h-6 w-6 shrink-0" />
            ) : (
              <UploadCloud className="text-primary h-6 w-6 shrink-0" />
            )}
            <span className="min-w-0">
              <span className="text-fg block truncate text-sm font-medium">
                {reply.media_filename ?? "Upload an image, video or PDF"}
              </span>
              <span className="text-fg-subtle block text-xs">
                {reply.media_key
                  ? "Click to replace"
                  : "JPG/PNG up to 5 MB, MP4 up to 16 MB, PDF up to 100 MB"}
              </span>
            </span>
          </button>
        </div>
      )}

      {reply.type !== "location" && (
        <Textarea
          name="reply_text"
          label={reply.type === "media" ? "Caption" : "Message"}
          rows={4}
          maxLength={reply.type === "text" ? 4096 : 1024}
          value={reply.text ?? ""}
          error={error}
          placeholder="Hi {{first_name}}! Thanks for writing to us…"
          hint={hint}
          onChange={(e) => set({ text: e.target.value })}
        />
      )}

      {(reply.type === "buttons" || reply.type === "list") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="reply_header"
            label="Header"
            placeholder="Optional bold title"
            maxLength={60}
            value={reply.header ?? ""}
            onChange={(e) => set({ header: e.target.value })}
          />
          <Input
            name="reply_footer"
            label="Footer"
            placeholder="Optional small text"
            maxLength={60}
            value={reply.footer ?? ""}
            onChange={(e) => set({ footer: e.target.value })}
          />
        </div>
      )}

      {reply.type === "buttons" && (
        <div className="space-y-2">
          <p className="text-fg text-sm font-medium">Buttons (up to 3, 20 characters each)</p>
          {buttons.map((b, i) => (
            <div key={i} className="flex gap-2">
              <Input
                name={`reply_button_${i}`}
                aria-label={`Button ${i + 1}`}
                value={b}
                maxLength={20}
                placeholder={["Track order", "Price list", "Talk to us"][i]}
                onChange={(e) => set({ buttons: buttons.map((x, j) => (j === i ? e.target.value : x)) })}
                wrapperClassName="flex-1"
              />
              <Button
                variant="ghost"
                iconOnly
                leftIcon={Trash2}
                aria-label={`Remove button ${i + 1}`}
                onClick={() => set({ buttons: buttons.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          {buttons.length < 3 && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={Plus}
              onClick={() => set({ buttons: [...buttons, ""] })}
            >
              Add button
            </Button>
          )}
          <p className="text-fg-faint text-xs">
            Make each button text also a keyword of another reply, so tapping it gets an answer.
          </p>
        </div>
      )}

      {reply.type === "list" && (
        <div className="space-y-2">
          <Input
            name="reply_list_button"
            label="List button text"
            placeholder="Options"
            maxLength={20}
            value={reply.list_button ?? ""}
            onChange={(e) => set({ list_button: e.target.value })}
            wrapperClassName="max-w-xs"
          />
          <p className="text-fg text-sm font-medium">Options (up to 10)</p>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2">
              <Input
                name={`reply_row_${i}_title`}
                aria-label={`Option ${i + 1} title`}
                placeholder="Title"
                maxLength={24}
                value={r.title}
                onChange={(e) =>
                  set({ rows: rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })
                }
              />
              <Input
                name={`reply_row_${i}_description`}
                aria-label={`Option ${i + 1} description`}
                placeholder="Description (optional)"
                maxLength={72}
                value={r.description ?? ""}
                onChange={(e) =>
                  set({ rows: rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })
                }
              />
              <Button
                variant="ghost"
                iconOnly
                leftIcon={Trash2}
                aria-label={`Remove option ${i + 1}`}
                onClick={() => set({ rows: rows.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          {rows.length < 10 && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={Plus}
              onClick={() => set({ rows: [...rows, { title: "", description: "" }] })}
            >
              Add option
            </Button>
          )}
        </div>
      )}

      {reply.type === "location" && (
        <div className={cn("grid gap-3 sm:grid-cols-2")}>
          <Input
            name="reply_latitude"
            label="Latitude"
            inputMode="decimal"
            placeholder="28.6315"
            value={reply.latitude ?? ""}
            onChange={(e) => set({ latitude: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <Input
            name="reply_longitude"
            label="Longitude"
            inputMode="decimal"
            placeholder="77.2167"
            value={reply.longitude ?? ""}
            onChange={(e) => set({ longitude: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <Input
            name="reply_place"
            label="Place name"
            placeholder="Our shop"
            value={reply.place ?? ""}
            onChange={(e) => set({ place: e.target.value })}
          />
          <Input
            name="reply_address"
            label="Address"
            value={reply.address ?? ""}
            onChange={(e) => set({ address: e.target.value })}
          />
          <p className="text-fg-faint text-xs sm:col-span-2">
            Tip: in Google Maps, right-click your shop and click the numbers at the top to copy them.
          </p>
        </div>
      )}
    </div>
  );
}
