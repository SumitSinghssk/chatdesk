import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export interface FileKind {
  icon: LucideIcon;
  label: string;
  /** Tailwind classes for the icon tile (WhatsApp-like colour per file type). */
  tone: string;
  /** Opens in the in-app viewer instead of downloading. */
  previewable: boolean;
}

const KINDS: { match: RegExp; kind: FileKind }[] = [
  { match: /pdf/, kind: { icon: FileText, label: "PDF", tone: "bg-red-500 text-white", previewable: true } },
  {
    match: /word|msword|\.docx?$|opendocument\.text/,
    kind: { icon: FileText, label: "DOC", tone: "bg-sky-600 text-white", previewable: false },
  },
  {
    match: /excel|spreadsheet|\.xlsx?$|\.csv$|text\/csv/,
    kind: { icon: FileSpreadsheet, label: "XLS", tone: "bg-emerald-600 text-white", previewable: false },
  },
  {
    match: /powerpoint|presentation|\.pptx?$/,
    kind: { icon: Presentation, label: "PPT", tone: "bg-orange-500 text-white", previewable: false },
  },
  {
    match: /zip|rar|7z|tar|gzip/,
    kind: { icon: FileArchive, label: "ZIP", tone: "bg-amber-500 text-white", previewable: false },
  },
  {
    match: /^image\//,
    kind: { icon: FileImage, label: "IMG", tone: "bg-violet-500 text-white", previewable: true },
  },
  {
    match: /^video\//,
    kind: { icon: FileVideo, label: "VIDEO", tone: "bg-pink-500 text-white", previewable: true },
  },
  {
    match: /^audio\//,
    kind: { icon: FileAudio, label: "AUDIO", tone: "bg-teal-500 text-white", previewable: false },
  },
  {
    match: /^text\/|\.txt$/,
    kind: { icon: FileText, label: "TXT", tone: "bg-slate-500 text-white", previewable: false },
  },
];

export function fileKind(mime: string | null | undefined, filename?: string | null): FileKind {
  const key = `${mime ?? ""} ${(filename ?? "").toLowerCase()}`;
  const found = KINDS.find(
    (k) => k.match.test(mime ?? "") || k.match.test((filename ?? "").toLowerCase()) || k.match.test(key)
  );
  if (found) return found.kind;
  const ext = filename?.split(".").pop()?.toUpperCase();
  return {
    icon: File,
    label: ext && ext.length <= 5 ? ext : "FILE",
    tone: "bg-slate-500 text-white",
    previewable: false,
  };
}
