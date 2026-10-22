"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Construction } from "lucide-react";
import { z } from "zod";

import { DatePicker, Input, Switch, Textarea } from "@/app/admin/_components/ui/index";
import type { MaintenanceSettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { toDateTimeLocal } from "@/lib/utils";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const schema = z.object({
  enabled: z.boolean(),
  title: z.string().max(255),
  message: z.string().max(2000),
  ends_at: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (d: MaintenanceSettings): Values => ({
  enabled: d.enabled,
  title: d.title ?? "",
  message: d.message ?? "",
  ends_at: toDateTimeLocal(d.ends_at),
});

export function MaintenanceTab({ data, canEdit }: TabProps<"maintenance">) {
  const save = useSaveGroup("maintenance");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(data) });
  const { register, control, handleSubmit, reset, formState, setError } = form;
  const errors = formState.errors;
  const enabled = useWatch({ control, name: "enabled" });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save({ ...values, ends_at: values.ends_at ? `${values.ends_at}:00` : null });
      reset(toValues(saved));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  return (
    <SettingsForm
      id="settings-maintenance"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(toValues(data))}
    >
      <SettingsSection
        title="Maintenance mode"
        description="Temporarily replace the public website with a maintenance page."
        icon={Construction}
      >
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Enable maintenance mode"
              hint="Visitors see the message below. The admin panel keeps working."
            />
          )}
        />
        {enabled && (
          <div
            role="alert"
            className="border-warning/30 bg-warning-soft text-warning flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              The public website will be unavailable to visitors{data.enabled ? "" : " once you save"}.
              Signed-in admins can still use the panel.
            </span>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Maintenance page" description="What visitors see while the website is down.">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <Input label="Title" error={errors.title?.message} {...register("title")} />
          <Controller
            control={control}
            name="ends_at"
            render={({ field, fieldState }) => (
              <DatePicker
                withTime
                label="Expected back"
                value={field.value}
                onChange={field.onChange}
                name={field.name}
                disabled={!canEdit}
                hint="Optional. Shown to visitors as the expected return time."
                error={fieldState.error?.message}
              />
            )}
          />
        </div>
        <Textarea label="Message" rows={4} error={errors.message?.message} {...register("message")} />
      </SettingsSection>
    </SettingsForm>
  );
}
