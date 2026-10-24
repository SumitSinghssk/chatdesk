import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATE_ONLY = /^d{4}-d{2}-d{2}$/;
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = { ...DATE_OPTIONS, hour: "numeric", minute: "2-digit" };

let displayTimeZone: string | undefined;
let displayLocale = "en-IN"; // 24 Oct 2026; "en-US" gives Oct 24, 2026
const formatters = new Map<string, Intl.DateTimeFormat>();

/** "day_first" (24 Oct 2026) or "month_first" (Oct 24, 2026), from the person's preferences. */
export function setDateOrder(order: "day_first" | "month_first" | null | undefined) {
  displayLocale = order === "month_first" ? "en-US" : "en-IN";
}

export function setDisplayTimeZone(timeZone: string | null | undefined) {
  if (!timeZone || timeZone === displayTimeZone) return;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone });
    displayTimeZone = timeZone;
  } catch {
    return;
  }
}

export function getDisplayTimeZone(): string | undefined {
  return displayTimeZone;
}

function formatter(kind: "date" | "datetime" | "parts", timeZone: string | undefined) {
  const key = `${kind}|${timeZone ?? ""}|${displayLocale}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    const options =
      kind === "date"
        ? DATE_OPTIONS
        : kind === "datetime"
          ? DATE_TIME_OPTIONS
          : ({
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            } as Intl.DateTimeFormatOptions);
    fmt = new Intl.DateTimeFormat(kind === "parts" ? "en-IN" : displayLocale, { ...options, timeZone });
    formatters.set(key, fmt);
  }
  return fmt;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  const dateOnly = typeof value === "string" && DATE_ONLY.test(value);
  return formatter("date", dateOnly ? "UTC" : displayTimeZone).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? formatter("datetime", displayTimeZone).format(date) : fallback;
}

export function timeAgo(value: string | Date | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 3600) return rtf.format(-Math.round(seconds / units[0][0]), units[0][1]);
  if (seconds < 86400) return rtf.format(-Math.round(seconds / units[1][0]), units[1][1]);
  if (seconds < 86400 * 30) return rtf.format(-Math.round(seconds / units[2][0]), units[2][1]);
  return formatDate(date);
}

export function toDateTimeLocal(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(
    formatter("parts", displayTimeZone)
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function initials(name: string | null | undefined): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stripHtml(html: string | null | undefined): string {
  return (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
