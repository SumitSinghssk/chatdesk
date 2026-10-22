import { ENQUIRY_SOURCES, ENQUIRY_STATUSES, type EnquiryStatus } from "@/app/admin/_lib/api/enquiriesApi";
import { titleCase } from "@/lib/utils";

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: "New",
  in_progress: "In progress",
  replied: "Replied",
  on_hold: "On hold",
  closed: "Closed",
  spam: "Spam",
};

export const STATUS_DOTS: Record<EnquiryStatus, string> = {
  new: "bg-indigo-500",
  in_progress: "bg-violet-500",
  replied: "bg-emerald-500",
  on_hold: "bg-amber-500",
  closed: "bg-slate-400",
  spam: "bg-red-500",
};

export const STATUS_OPTIONS = ENQUIRY_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  dot: STATUS_DOTS[s],
}));

export const sourceLabel = (source: string) => (source === "whatsapp" ? "WhatsApp" : titleCase(source));

export const SOURCE_OPTIONS = ENQUIRY_SOURCES.map((s) => ({ value: s, label: sourceLabel(s) }));

export const fromDateTimeLocal = (value: string | null | undefined) => (value ? `${value}:00` : null);
