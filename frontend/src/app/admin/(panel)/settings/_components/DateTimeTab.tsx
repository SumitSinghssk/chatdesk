"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, Globe } from "lucide-react";
import { z } from "zod";

import { Select, type SelectOption } from "@/app/admin/_components/ui/index";
import type { DateTimeSettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const DATE_FORMATS = ["d M Y", "d F Y", "M d, Y", "F j, Y", "d/m/Y", "m/d/Y", "Y-m-d", "D, d M Y"];
const TIME_FORMATS = ["h:mm a", "hh:mm a", "h:mm A", "HH:mm", "H:mm", "HH:mm:ss"];

function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "long",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: String(p.weekday),
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

export function formatPattern(pattern: string, date: Date, timeZone: string): string {
  let t;
  try {
    t = partsIn(date, timeZone);
  } catch {
    t = partsIn(date, "UTC");
  }
  const h12 = t.hour % 12 || 12;
  const tokens: Record<string, string> = {
    HH: pad(t.hour),
    H: String(t.hour),
    hh: pad(h12),
    h: String(h12),
    mm: pad(t.minute),
    ss: pad(t.second),
    a: t.hour < 12 ? "am" : "pm",
    A: t.hour < 12 ? "AM" : "PM",
    d: pad(t.day),
    j: String(t.day),
    D: t.weekday.slice(0, 3),
    l: t.weekday,
    m: pad(t.month),
    n: String(t.month),
    M: MONTHS[t.month - 1]!.slice(0, 3),
    F: MONTHS[t.month - 1]!,
    Y: String(t.year),
    y: String(t.year).slice(-2),
  };
  return pattern.replace(/HH|hh|mm|ss|[HhaAdjDlmnMFYy]/g, (tok) => tokens[tok] ?? tok);
}

function supportedTimeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

const schema = z.object({
  timezone: z.string().min(1, "Timezone is required").max(64),
  date_format: z.string().min(1).max(30),
  time_format: z.string().min(1).max(30),
});

function offsetOf(timeZone: string, date: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName");
    return part?.value === "GMT" ? "GMT+0" : (part?.value ?? "");
  } catch {
    return "";
  }
}

function timeZoneOptions(zones: string[], date: Date): SelectOption[] {
  return zones
    .map((zone) => {
      const slash = zone.indexOf("/");
      const group = slash === -1 ? "Other" : zone.slice(0, slash);
      const city = (slash === -1 ? zone : zone.slice(slash + 1)).replace(/_/g, " ").replace(/\//g, " / ");
      const offset = offsetOf(zone, date);
      return { value: zone, label: city, group, description: offset ? `${zone} · ${offset}` : zone };
    })
    .sort((a, b) => {
      const ga = a.group === "Other" ? "" : a.group;
      const gb = b.group === "Other" ? "" : b.group;
      return ga.localeCompare(gb) || a.label.localeCompare(b.label);
    });
}

const withCurrent = (list: string[], current: string) =>
  current && !list.includes(current) ? [current, ...list] : list;

export function DateTimeTab({ data, canEdit }: TabProps<"date_time">) {
  const save = useSaveGroup("date_time");
  const form = useForm<DateTimeSettings>({ resolver: zodResolver(schema), defaultValues: data });
  const { control, handleSubmit, reset, formState, setError } = form;
  const [timezone, dateFormat, timeFormat] = useWatch({
    control,
    name: ["timezone", "date_format", "time_format"],
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const zoneOptions = useMemo(
    () => timeZoneOptions(withCurrent(supportedTimeZones(), data.timezone), new Date()),
    [data.timezone]
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(await save(values));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  const option = (f: string): SelectOption => ({
    value: f,
    label: f,
    description: formatPattern(f, now, timezone),
  });

  return (
    <SettingsForm
      id="settings-date-time"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(data)}
      note="Every date on the website, in the admin and in emails follows these settings."
    >
      <SettingsSection
        title="Date & time"
        description="Timezone and display formats used on the website and in emails."
        icon={Clock}
      >
        <Controller
          control={control}
          name="timezone"
          render={({ field, fieldState }) => (
            <Select
              label="Timezone"
              icon={Globe}
              searchable
              options={zoneOptions}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={fieldState.error?.message}
              hint="Search by city or region, e.g. Kolkata, Dubai or London."
            />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="date_format"
            render={({ field, fieldState }) => (
              <Select
                label="Date format"
                icon={CalendarDays}
                options={withCurrent(DATE_FORMATS, data.date_format).map(option)}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="time_format"
            render={({ field, fieldState }) => (
              <Select
                label="Time format"
                icon={Clock}
                options={withCurrent(TIME_FORMATS, data.time_format).map(option)}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                error={fieldState.error?.message}
              />
            )}
          />
        </div>
        <div className="border-line bg-page rounded-xl border p-4">
          <p className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">Preview</p>
          <p className="text-fg tabular mt-1 text-xl font-semibold">
            {formatPattern(dateFormat, now, timezone)} · {formatPattern(timeFormat, now, timezone)}
          </p>
          <p className="text-fg-subtle mt-0.5 text-xs">Current time in {timezone}</p>
        </div>
      </SettingsSection>
    </SettingsForm>
  );
}
