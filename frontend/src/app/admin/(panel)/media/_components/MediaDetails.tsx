"use client";

import { useRef, useState } from "react";
import { Check, Copy, Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonClasses, Input, Modal } from "@/app/admin/_components/ui/index";
import { absoluteUrl } from "@/config/site";
import { mediaApi, type MediaFile } from "@/app/admin/_lib/api/mediaApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { formatBytes, formatDateTime } from "@/lib/utils";

export const isImage = (file: MediaFile) => (file.mime ?? "").startsWith("image/");

export function MediaDetails({
  file,
  canEdit,
  canDelete,
  onClose,
  onChanged,
  onDelete,
}: {
  file: MediaFile | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (file: MediaFile) => void;
}) {
  return (
    <Modal
      open={!!file}
      onClose={onClose}
      size="md"
      title={file?.original_name || file?.filename || "File"}
      description={file?.folder}
    >
      {file && (
        <Details
          key={file.id}
          file={file}
          canEdit={canEdit}
          canDelete={canDelete}
          onChanged={onChanged}
          onDelete={onDelete}
        />
      )}
    </Modal>
  );
}

function Details({
  file,
  canEdit,
  canDelete,
  onChanged,
  onDelete,
}: {
  file: MediaFile;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onDelete: (file: MediaFile) => void;
}) {
  const [alt, setAlt] = useState(file.alt ?? "");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const url = absoluteUrl(file.url) ?? file.url;
  const previewUrl = `${file.url}${file.url.includes("?") ? "&" : "?"}v=${previewVersion ?? file.updated_at}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const saveAlt = async () => {
    setSaving(true);
    try {
      const res = await mediaApi.update(file.id, alt.trim());
      toast.success(res.message ?? "Saved");
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save alt text"));
    } finally {
      setSaving(false);
    }
  };

  const replace = async (replacement: File | undefined) => {
    if (!replacement) return;
    setReplacing(true);
    try {
      const res = await mediaApi.replace(file.id, replacement);
      toast.success(res ? "File replaced. Its URL has stayed the same." : "File replaced");
      setPreviewVersion(Date.now());
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't replace the file"));
    } finally {
      setReplacing(false);
      if (replacementInput.current) replacementInput.current.value = "";
    }
  };

  const meta: [string, string][] = [
    ["Type", file.mime || file.extension?.toUpperCase() || "—"],
    ["Size", formatBytes(file.size)],
    ...(file.width && file.height
      ? [["Dimensions", `${file.width} × ${file.height} px`] as [string, string]]
      : []),
    ["Folder", file.folder],
    ["Uploaded by", file.uploaded_by?.name ?? "—"],
    ["Uploaded", formatDateTime(file.created_at)],
  ];

  return (
    <div className="space-y-5">
      <div className="border-line bg-page flex items-center justify-center overflow-hidden rounded-xl border">
        {isImage(file) ? (
          <img src={previewUrl} alt={file.alt ?? ""} className="max-h-80 w-auto object-contain" />
        ) : (
          <div className="text-fg-subtle flex flex-col items-center gap-2 py-12">
            <FileText size={40} />
            <span className="text-xs font-semibold uppercase">{file.extension || "file"}</span>
          </div>
        )}
      </div>

      <Input
        label="File URL"
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
        rightAddon={
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            leftIcon={copied ? Check : Copy}
            aria-label="Copy URL"
            title="Copy URL"
            onClick={copy}
          />
        }
      />

      <dl className="border-line grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 text-sm">
        {meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-fg-subtle text-xs">{k}</dt>
            <dd className="text-fg truncate font-medium" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {isImage(file) && (
        <div className="space-y-2">
          <Input
            label="Alt text"
            hint="Describes the image for screen readers and search engines."
            maxLength={255}
            value={alt}
            disabled={!canEdit}
            onChange={(e) => setAlt(e.target.value)}
          />
          {canEdit && (
            <Button size="sm" loading={saving} disabled={alt.trim() === (file.alt ?? "")} onClick={saveAlt}>
              Save alt text
            </Button>
          )}
        </div>
      )}

      <div className="border-line flex flex-wrap gap-2 border-t pt-4">
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          download={file.original_name ?? undefined}
          className={buttonClasses("secondary", "md")}
        >
          <Download className="h-4 w-4" /> Open
        </a>
        {canEdit && (
          <>
            <input
              ref={replacementInput}
              type="file"
              accept={file.extension ? `.${file.extension}` : undefined}
              className="sr-only"
              onChange={(e) => void replace(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              leftIcon={Upload}
              loading={replacing}
              onClick={() => replacementInput.current?.click()}
            >
              Replace {isImage(file) ? "image" : "file"}
            </Button>
          </>
        )}
        {canDelete && (
          <Button
            variant="danger-outline"
            leftIcon={Trash2}
            className="ml-auto"
            onClick={() => onDelete(file)}
          >
            Delete file
          </Button>
        )}
      </div>
    </div>
  );
}
