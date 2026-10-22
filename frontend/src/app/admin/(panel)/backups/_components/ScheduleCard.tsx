"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorText,
  Input,
  Select,
  Switch,
  TimePicker,
} from "@/app/admin/_components/ui/index";
import { backupsApi, type BackupSchedule, type BackupSettings } from "@/app/admin/_lib/api/backupsApi";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { formatDateTime } from "@/lib/utils";

import { QK } from "@/config/query-keys";
const FREQUENCIES = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
  (label, i) => ({
    value: i + 1,
    label,
  })
);
const MONTHDAYS = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

export function ScheduleCard({ schedule, canEdit }: { schedule: BackupSchedule; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BackupSettings>(schedule.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BackupSettings>(key: K, value: BackupSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const disabled = !canEdit;

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const res = await backupsApi.saveSettings(form);
      toast.success(res.message ?? "Backup schedule saved");
      queryClient.setQueryData([QK.BACKUPS, "settings"], res.data);
      queryClient.invalidateQueries({ queryKey: [QK.BACKUPS] });
      queryClient.invalidateQueries({ queryKey: [QK.SYSTEM_HEALTH] });
    } catch (err) {
      setErrors(apiFieldErrors(err));
      toast.error(apiErrorMessage(err, "The schedule could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Automatic backups" description={`${schedule.description}.`} icon={CalendarClock} />
      <CardBody className="space-y-5">
        <Switch
          checked={form.enabled}
          onChange={(v) => set("enabled", v)}
          disabled={disabled}
          label="Make backups automatically"
          hint="Runs at the time you choose. Needs the scheduler (see “Run the scheduler”)."
        />

        <div className={form.enabled ? "space-y-5" : "pointer-events-none space-y-5 opacity-50"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="How often"
              value={form.frequency}
              disabled={disabled}
              onChange={(v) => set("frequency", v as BackupSettings["frequency"])}
              options={FREQUENCIES}
              error={errors.frequency}
            />
            {form.frequency === "weekly" && (
              <Select
                label="On"
                value={form.weekday}
                disabled={disabled}
                onChange={(v) => set("weekday", Number(v))}
                options={WEEKDAYS}
                error={errors.weekday}
              />
            )}
            {form.frequency === "monthly" && (
              <Select
                label="On day"
                value={form.monthday}
                disabled={disabled}
                onChange={(v) => set("monthday", Number(v))}
                options={MONTHDAYS}
                hint="1–28, so it happens every month."
                error={errors.monthday}
              />
            )}
            <TimePicker
              label="At"
              value={form.time}
              minuteStep={5}
              disabled={disabled}
              onChange={(v) => set("time", v)}
              hint={`${schedule.timezone.replace(/_/g, " ")} time`}
              error={errors.time}
              required
            />
            <Input
              type="number"
              label="Keep the last"
              min={1}
              max={60}
              value={form.keep}
              disabled={disabled}
              onChange={(e) => set("keep", Number(e.target.value))}
              hint="Older scheduled backups are deleted."
              error={errors.keep}
              required
            />
          </div>

          <div className="border-line bg-page/60 grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <Switch
              checked={form.include_database}
              onChange={(v) => set("include_database", v)}
              disabled={disabled}
              label="Database"
              hint="All content, users and settings."
            />
            <Switch
              checked={form.include_files}
              onChange={(v) => set("include_files", v)}
              disabled={disabled}
              label="Uploaded files"
              hint="Images and documents in storage."
            />
          </div>
          {(errors.include_database || (!form.include_database && !form.include_files)) && (
            <ErrorText
              message={errors.include_database ?? "Choose the database, the uploaded files, or both."}
            />
          )}
        </div>

        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-fg-subtle text-sm">
            {schedule.next_run_at ? (
              <>
                Next automatic backup:{" "}
                <strong className="text-fg font-semibold">{formatDateTime(schedule.next_run_at)}</strong> (
                {timeUntil(schedule.next_run_at)})
              </>
            ) : (
              "Automatic backups are off."
            )}
          </p>
          {canEdit && (
            <Button leftIcon={Check} loading={saving} onClick={save}>
              Save schedule
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function timeUntil(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  if (Number.isNaN(seconds) || seconds < 60) return "any minute now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}
