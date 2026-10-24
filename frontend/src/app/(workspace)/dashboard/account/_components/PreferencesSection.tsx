"use client";

import { useState } from "react";
import { Laptop, Moon, Save, SlidersHorizontal, Sun, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, Select, Switch } from "@/app/admin/_components/ui/index";
import { errorMessage, type Preferences } from "@/app/(customer)/_lib/customerApi";
import { playChime } from "@/lib/alerts";
import { cn } from "@/lib/utils";

import { CardHeader } from "../../_components/CardHeader";
import { useDashboard } from "../../_components/DashboardContext";
import { accountApi } from "../../_lib/accountApi";

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"];
  }
})();

function offset(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value.replace("GMT", "UTC") ?? "";
  } catch {
    return "";
  }
}

const sample = new Date(2026, 9, 24, 15, 30);

export function PreferencesSection() {
  const { me, setMe } = useDashboard();
  const [form, setForm] = useState<Preferences>(me.preferences);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(me.preferences);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const save = async () => {
    setBusy(true);
    try {
      const res = await accountApi.savePreferences(form);
      setMe({ ...me, preferences: res.data });
      toast.success("Preferences saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const themes = [
    { value: "system", label: "Same as my device", icon: Laptop },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ] as const;

  return (
    <Card>
      <CardHeader
        title="Preferences"
        icon={SlidersHorizontal}
        description="How ChatDesk looks and behaves for you."
      />
      <div className="space-y-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Time zone"
            value={form.timezone}
            onChange={(timezone) => setForm((f) => ({ ...f, timezone }))}
            searchable
            options={[
              { value: "", label: `This device's time zone (${browserZone})` },
              ...ZONES.map((z) => ({ value: z, label: `${z.replace(/_/g, " ")} (${offset(z)})` })),
            ]}
            hint="Times in the inbox, reports and logs are shown in it."
          />
          <Select
            label="Date format"
            value={form.date_format}
            onChange={(v) => setForm((f) => ({ ...f, date_format: v as Preferences["date_format"] }))}
            options={[
              {
                value: "day_first",
                label: `Day first: ${new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(sample)}`,
              },
              {
                value: "month_first",
                label: `Month first: ${new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(sample)}`,
              },
            ]}
          />
        </div>
        <div>
          <p className="text-fg mb-2 text-sm font-medium">Theme</p>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={form.theme === t.value}
                onClick={() => setForm((f) => ({ ...f, theme: t.value }))}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                  form.theme === t.value
                    ? "border-primary bg-primary-soft ring-primary/30 ring-2"
                    : "border-line hover:bg-hover"
                )}
              >
                <t.icon className="text-primary h-5 w-5" aria-hidden />
                <span className="text-fg text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Switch
            checked={form.sound}
            onChange={(sound) => setForm((f) => ({ ...f, sound }))}
            label="Play a sound for new customer messages and notifications"
          />
          <Button variant="ghost" size="sm" leftIcon={Volume2} onClick={playChime}>
            Hear it
          </Button>
        </div>
      </div>
      <div className="border-line flex justify-end border-t px-5 py-3">
        <Button leftIcon={Save} onClick={save} loading={busy} disabled={!dirty}>
          Save preferences
        </Button>
      </div>
    </Card>
  );
}
