import type { BadgeTone } from "@/app/admin/_components/ui/index";

import type { CampaignStatus, RecipientStatus, Segment, VariableSourceKind } from "../../_lib/campaignsApi";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  waiting: { label: "Waiting", tone: "info" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "brand" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export const RECIPIENT_STATUS: Record<RecipientStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  delivered: { label: "Delivered", tone: "info" },
  read: { label: "Read", tone: "success" },
  replied: { label: "Replied", tone: "success" },
  clicked: { label: "Clicked", tone: "brand" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "warning" },
};

/**
 * Groups for retargeting: "people from campaign X who …". `buttons`: only for templates with quick
 * reply buttons.
 */
export const SEGMENTS: { value: Segment; label: string; hint: string; buttons?: boolean }[] = [
  { value: "read_not_replied", label: "Read it but didn't reply", hint: "Opened it and never wrote back" },
  { value: "not_read", label: "Didn't read it", hint: "Delivered or sent, but not opened" },
  { value: "not_replied", label: "Didn't reply", hint: "Read or not, never wrote back" },
  {
    value: "not_clicked",
    label: "Didn't tap a button",
    hint: "Got it but used no quick reply",
    buttons: true,
  },
  { value: "clicked", label: "Tapped a button", hint: "Used a quick reply button", buttons: true },
  { value: "read", label: "Read it", hint: "Opened the message" },
  { value: "replied", label: "Replied", hint: "Wrote back after it" },
  { value: "failed", label: "Didn't get it", hint: "WhatsApp couldn't deliver it" },
  { value: "delivered", label: "Got it", hint: "Reached their phone" },
  { value: "sent", label: "Were sent it", hint: "All successful sends" },
];

/** "People who read it but didn't reply" */
export const segmentText = (segment: Segment | null) => {
  const label = SEGMENTS.find((s) => s.value === segment)?.label ?? "Got it";
  return `People who ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
};

/** How long a follow-up waits after the first campaign finishes. */
export const WAITS = [1, 2, 4, 6, 12, 24, 48, 72, 120, 168];

export const waitText = (hours: number | null) => {
  const h = hours ?? 0;
  if (h % 24 === 0) return h === 168 ? "1 week" : `${h / 24} day${h === 24 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"}`;
};

export const SOURCES: { value: VariableSourceKind; label: string }[] = [
  { value: "first_name", label: "Contact first name" },
  { value: "name", label: "Contact full name" },
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "attribute", label: "Custom field" },
  { value: "static", label: "Same text for everyone" },
];

export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
