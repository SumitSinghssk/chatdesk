import {
  CircleCheck,
  CircleDashed,
  CircleOff,
  CirclePause,
  CircleX,
  Clock,
  KeyRound,
  Megaphone,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { BadgeTone } from "@/app/admin/_components/ui/index";

import type { TemplateCategory, TemplateStatus } from "../../_lib/templatesApi";

export const STATUS: Record<string, { label: string; tone: BadgeTone; icon: LucideIcon; hint: string }> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    icon: CircleDashed,
    hint: "Saved here only. Submit it to Meta when it's ready.",
  },
  pending: {
    label: "In review",
    tone: "warning",
    icon: Clock,
    hint: "Meta is reviewing it. Most templates are approved within minutes, some take up to 24 hours.",
  },
  in_appeal: {
    label: "In appeal",
    tone: "warning",
    icon: Clock,
    hint: "You appealed the rejection. Meta is taking another look.",
  },
  pending_deletion: {
    label: "Deleting",
    tone: "neutral",
    icon: Clock,
    hint: "Meta is deleting this template.",
  },
  approved: {
    label: "Approved",
    tone: "success",
    icon: CircleCheck,
    hint: "Ready to send in chats and campaigns.",
  },
  rejected: {
    label: "Rejected",
    tone: "danger",
    icon: CircleX,
    hint: "Meta didn't approve it. Edit it and submit again.",
  },
  paused: {
    label: "Paused",
    tone: "warning",
    icon: CirclePause,
    hint: "Meta paused it because customers reported or blocked it. It's back after the pause, or edit it.",
  },
  disabled: {
    label: "Disabled",
    tone: "danger",
    icon: CircleOff,
    hint: "Meta disabled it after repeated low quality. Create a new one.",
  },
  archived: { label: "Archived", tone: "neutral", icon: CircleOff, hint: "Archived in WhatsApp Manager." },
  limit_exceeded: {
    label: "Limit reached",
    tone: "danger",
    icon: CircleOff,
    hint: "Your account reached Meta's template limit.",
  },
};

export const statusOf = (s: TemplateStatus | string) =>
  STATUS[s] ?? { label: s.replace(/_/g, " "), tone: "neutral" as BadgeTone, icon: CircleDashed, hint: "" };

export const CATEGORIES: {
  value: TemplateCategory;
  label: string;
  icon: LucideIcon;
  hint: string;
  example: string;
}[] = [
  {
    value: "marketing",
    label: "Marketing",
    icon: Megaphone,
    hint: "Offers, launches, festive greetings, abandoned carts, re-engagement.",
    example: "Diwali sale: 20% off everything this weekend",
  },
  {
    value: "utility",
    label: "Utility",
    icon: Wrench,
    hint: "Updates about something the customer did: orders, bookings, payments, delivery.",
    example: "Your order #1042 has shipped",
  },
  {
    value: "authentication",
    label: "Authentication",
    icon: KeyRound,
    hint: "One-time passwords for login and verification. Meta writes the text.",
    example: "123456 is your verification code",
  },
];

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const QUALITY: Record<string, { label: string; tone: BadgeTone }> = {
  GREEN: { label: "High", tone: "success" },
  YELLOW: { label: "Medium", tone: "warning" },
  RED: { label: "Low", tone: "danger" },
  UNKNOWN: { label: "Not rated", tone: "neutral" },
};

// Languages Meta supports for templates (code -> name)
export const LANGUAGES: { value: string; label: string }[] = [
  ["af", "Afrikaans"],
  ["sq", "Albanian"],
  ["ar", "Arabic"],
  ["az", "Azerbaijani"],
  ["bn", "Bengali"],
  ["bg", "Bulgarian"],
  ["ca", "Catalan"],
  ["zh_CN", "Chinese (China)"],
  ["zh_HK", "Chinese (Hong Kong)"],
  ["zh_TW", "Chinese (Taiwan)"],
  ["hr", "Croatian"],
  ["cs", "Czech"],
  ["da", "Danish"],
  ["nl", "Dutch"],
  ["en", "English"],
  ["en_GB", "English (UK)"],
  ["en_US", "English (US)"],
  ["et", "Estonian"],
  ["fil", "Filipino"],
  ["fi", "Finnish"],
  ["fr", "French"],
  ["ka", "Georgian"],
  ["de", "German"],
  ["el", "Greek"],
  ["gu", "Gujarati"],
  ["ha", "Hausa"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["ga", "Irish"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["kn", "Kannada"],
  ["kk", "Kazakh"],
  ["rw_RW", "Kinyarwanda"],
  ["ko", "Korean"],
  ["ky_KG", "Kyrgyz"],
  ["lo", "Lao"],
  ["lv", "Latvian"],
  ["lt", "Lithuanian"],
  ["mk", "Macedonian"],
  ["ms", "Malay"],
  ["ml", "Malayalam"],
  ["mr", "Marathi"],
  ["nb", "Norwegian"],
  ["fa", "Persian"],
  ["pl", "Polish"],
  ["pt_BR", "Portuguese (Brazil)"],
  ["pt_PT", "Portuguese (Portugal)"],
  ["pa", "Punjabi"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["sr", "Serbian"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["es", "Spanish"],
  ["es_AR", "Spanish (Argentina)"],
  ["es_ES", "Spanish (Spain)"],
  ["es_MX", "Spanish (Mexico)"],
  ["sw", "Swahili"],
  ["sv", "Swedish"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["ur", "Urdu"],
  ["uz", "Uzbek"],
  ["vi", "Vietnamese"],
  ["zu", "Zulu"],
].map(([value, label]) => ({ value, label: `${label} · ${value}` }));

export const languageName = (code: string) =>
  LANGUAGES.find((l) => l.value === code)?.label.split(" · ")[0] ?? code;
