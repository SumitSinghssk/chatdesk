const DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "14:05" today, "Yesterday", weekday this week, otherwise "12 Oct". For the chat list. */
export function listTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Separator between days in a chat: "Today", "Yesterday", "Monday, 12 October 2026". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Time left in the 24-hour reply window: "23h 10m", "42m", or null when closed. */
export function windowLeft(expiresIso: string | null, nowMs: number): string | null {
  if (!expiresIso) return null;
  const ms = new Date(expiresIso).getTime() - nowMs;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
