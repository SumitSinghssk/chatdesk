"use client";

import { useState } from "react";
import { AlarmClock } from "lucide-react";

import { Button, Checkbox, Input, Modal } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

/** Preset times, in the person's own time zone. */
function presets(now = new Date()) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const evening = at(0, 18);
  const monday = at((8 - now.getDay()) % 7 || 7, 9);
  return [
    { key: "1h", label: "In 1 hour", at: new Date(now.getTime() + 3_600_000) },
    { key: "3h", label: "In 3 hours", at: new Date(now.getTime() + 3 * 3_600_000) },
    ...(evening.getTime() - now.getTime() > 30 * 60_000
      ? [{ key: "eve", label: "This evening", at: evening }]
      : []),
    { key: "tomorrow", label: "Tomorrow morning", at: at(1, 9) },
    { key: "monday", label: "Next Monday", at: monday },
  ];
}

const label = (d: Date) =>
  d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** "2026-11-14T09:00" for <input type="datetime-local"> */
const localValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function SnoozeDialog({
  open,
  count = 1,
  initial,
  onClose,
  onSnooze,
}: {
  open: boolean;
  /** how many chats (bulk snooze) */
  count?: number;
  initial?: { until: string | null; note: string | null; keep: boolean };
  onClose: () => void;
  onSnooze: (body: { until: string; note: string | null; keep: boolean }) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string>(initial?.until ? "custom" : "tomorrow");
  const [custom, setCustom] = useState(() =>
    localValue(initial?.until ? new Date(initial.until) : new Date(Date.now() + 86_400_000))
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [keep, setKeep] = useState(initial?.keep ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = presets();

  const until = () => (picked === "custom" ? new Date(custom) : options.find((o) => o.key === picked)?.at);

  const save = async () => {
    const when = until();
    if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      setError("Pick a time in the future");
      return;
    }
    setBusy(true);
    const ok = await onSnooze({ until: when.toISOString(), note: note.trim() || null, keep });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={count > 1 ? `Snooze ${count} chats` : "Snooze chat"}
      description="Hide it from the inbox until then. It comes back on top, and you get a reminder."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={AlarmClock} loading={busy} onClick={save}>
            Snooze
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-1.5" role="radiogroup" aria-label="Snooze until">
          {[...options, { key: "custom", label: "Pick a date and time", at: null }].map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={picked === o.key}
              onClick={() => {
                setPicked(o.key);
                setError("");
              }}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                picked === o.key
                  ? "border-primary bg-primary-soft text-fg"
                  : "border-line hover:bg-hover text-fg"
              )}
            >
              <span className="font-medium">{o.label}</span>
              {o.at && <span className="text-fg-subtle text-xs">{label(o.at)}</span>}
            </button>
          ))}
        </div>
        {picked === "custom" && (
          <Input
            type="datetime-local"
            label="Until"
            value={custom}
            min={localValue(new Date())}
            onChange={(e) => {
              setCustom(e.target.value);
              setError("");
            }}
            error={error || undefined}
          />
        )}
        {picked !== "custom" && error && <p className="text-danger text-xs">{error}</p>}
        <Input
          label="Note (optional)"
          placeholder="e.g. Waiting for the courier's reply"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Checkbox label="Keep snoozed even if the customer writes" checked={keep} onChange={setKeep} />
      </div>
    </Modal>
  );
}
