"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, Select, Switch, Textarea } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { TagInput } from "../../_components/TagInput";
import { automationApi, type AutomationSettings, type Day } from "../../_lib/automationApi";

const DAYS: { key: Day; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
const ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Kathmandu",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
].map((z) => ({ value: z, label: z.replace("_", " ") }));

function useSave(onSaved: () => void) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async (body: AutomationSettings) => {
    setSaving(true);
    setErrors({});
    try {
      const res = await automationApi.saveSettings(body);
      toast.success(res.message ?? "Saved");
      onSaved();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return { saving, errors, save };
}

export function HoursTab({ initial, onSaved }: { initial: AutomationSettings; onSaved: () => void }) {
  const [form, setForm] = useState(initial);
  const { saving, save } = useSave(onSaved);
  const setDay = (day: Day, patch: Partial<AutomationSettings["hours"][Day]>) =>
    setForm((f) => ({ ...f, hours: { ...f.hours, [day]: { ...f.hours[day], ...patch } } }));
  const copyMonday = () =>
    setForm((f) => ({
      ...f,
      hours: Object.fromEntries(
        DAYS.map((d) => [d.key, d.key === "sun" ? f.hours.sun : { ...f.hours.mon }])
      ) as AutomationSettings["hours"],
    }));

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select
          id="hours-timezone"
          label="Time zone"
          searchable
          value={form.timezone}
          options={ZONES}
          onChange={(timezone) => setForm({ ...form, timezone })}
          wrapperClassName="w-64"
        />
        <Badge tone={initial.open_now ? "success" : "warning"} dot>
          {initial.open_now ? "Open right now" : "Closed right now"}
        </Badge>
      </div>
      <ul className="divide-line border-line divide-y rounded-xl border" aria-label="Office hours">
        {DAYS.map((d) => {
          const day = form.hours[d.key];
          return (
            <li key={d.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="w-28 shrink-0">
                <Switch
                  checked={day.open}
                  onChange={(open) => setDay(d.key, { open })}
                  label={d.label}
                  size="sm"
                />
              </span>
              {day.open ? (
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    aria-label={`${d.label} opens`}
                    value={day.start}
                    onChange={(e) => setDay(d.key, { start: e.target.value })}
                    className="border-line bg-surface-2 text-fg rounded-md border px-2 py-1"
                  />
                  <span className="text-fg-subtle">to</span>
                  <input
                    type="time"
                    aria-label={`${d.label} closes`}
                    value={day.end}
                    onChange={(e) => setDay(d.key, { end: e.target.value })}
                    className="border-line bg-surface-2 text-fg rounded-md border px-2 py-1"
                  />
                </span>
              ) : (
                <span className={cn("text-fg-faint text-sm")}>Closed all day</span>
              )}
            </li>
          );
        })}
      </ul>
      <Button size="sm" variant="ghost" onClick={copyMonday}>
        Use Monday&apos;s hours for every weekday and Saturday
      </Button>
      <Switch
        checked={form.away_when_nobody_available}
        onChange={(away_when_nobody_available) => setForm({ ...form, away_when_nobody_available })}
        label="Also send the away message when everyone in the team is set to Away"
        hint="Useful for lunch breaks or holidays inside office hours."
      />
      <div className="flex justify-end">
        <Button loading={saving} onClick={() => save(form)}>
          Save office hours
        </Button>
      </div>
    </div>
  );
}

export function OptOutTab({ initial, onSaved }: { initial: AutomationSettings; onSaved: () => void }) {
  const [form, setForm] = useState(initial);
  const { saving, save } = useSave(onSaved);
  return (
    <div className="space-y-6 p-4 sm:p-5">
      <p className="text-fg-subtle text-sm">
        When someone sends one of these words (the whole message), they&apos;re marked opted out and
        won&apos;t get campaigns any more. This keeps your number&apos;s quality high, as Meta expects.
      </p>
      <section className="space-y-3">
        <TagInput
          id="opt-out-keywords"
          label="Opt-out words"
          value={form.opt_out_keywords}
          onChange={(opt_out_keywords) => setForm({ ...form, opt_out_keywords })}
          placeholder="e.g. stop, and press Enter"
        />
        <Textarea
          name="opt_out_reply"
          label="Reply when someone opts out"
          rows={2}
          value={form.opt_out_reply ?? ""}
          onChange={(e) => setForm({ ...form, opt_out_reply: e.target.value })}
          hint="Leave empty to opt them out silently."
        />
      </section>
      <section className="space-y-3">
        <TagInput
          id="opt-in-keywords"
          label="Opt back in words"
          value={form.opt_in_keywords}
          onChange={(opt_in_keywords) => setForm({ ...form, opt_in_keywords })}
          placeholder="e.g. start, and press Enter"
        />
        <Textarea
          name="opt_in_reply"
          label="Reply when someone opts back in"
          rows={2}
          value={form.opt_in_reply ?? ""}
          onChange={(e) => setForm({ ...form, opt_in_reply: e.target.value })}
        />
      </section>
      <div className="flex justify-end">
        <Button loading={saving} onClick={() => save(form)}>
          Save opt-out settings
        </Button>
      </div>
    </div>
  );
}
