import type { BadgeTone } from "@/app/admin/_components/ui/index";

import type { CampaignStatus, RecipientStatus, Segment, VariableSourceKind } from "../../_lib/campaignsApi";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
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

/** Groups for retargeting: "people from campaign X who …" */
export const SEGMENTS: { value: Segment; label: string; hint: string }[] = [
  { value: "not_read", label: "Didn't read it", hint: "Delivered or sent, but not opened" },
  { value: "read", label: "Read it", hint: "Opened the message" },
  { value: "not_replied", label: "Didn't reply", hint: "Got it but never wrote back" },
  { value: "replied", label: "Replied", hint: "Wrote back after it" },
  { value: "clicked", label: "Tapped a button", hint: "Used a quick reply button" },
  { value: "failed", label: "Failed", hint: "WhatsApp couldn't deliver it" },
  { value: "delivered", label: "Delivered", hint: "Reached their phone" },
  { value: "sent", label: "Everyone it was sent to", hint: "All successful sends" },
];

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
