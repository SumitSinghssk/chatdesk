"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Code2 } from "lucide-react";
import { z } from "zod";

import { Textarea } from "@/app/admin/_components/ui/index";
import type { ScriptsSettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const schema = z.object({
  header_scripts: z.string().max(50000),
  footer_scripts: z.string().max(50000),
  custom_css: z.string().max(50000),
});

export function ScriptsTab({ data, canEdit }: TabProps<"scripts">) {
  const save = useSaveGroup("scripts");
  const form = useForm<ScriptsSettings>({ resolver: zodResolver(schema), defaultValues: data });
  const { register, handleSubmit, reset, formState, setError } = form;
  const errors = formState.errors;
  const mono = "font-mono text-xs";

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(await save(values));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  return (
    <SettingsForm
      id="settings-scripts"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(data)}
    >
      <SettingsSection
        title="Scripts & CSS"
        description="Code added to every page of the website — analytics, chat widgets, pixels, style tweaks."
        icon={Code2}
      >
        <Textarea
          label="Header scripts"
          rows={7}
          spellCheck={false}
          className={mono}
          placeholder="<!-- Google tag (gtag.js) -->"
          hint="Inserted inside <head> on every page."
          error={errors.header_scripts?.message}
          {...register("header_scripts")}
        />
        <Textarea
          label="Footer scripts"
          rows={7}
          spellCheck={false}
          className={mono}
          hint="Inserted before </body> on every page."
          error={errors.footer_scripts?.message}
          {...register("footer_scripts")}
        />
        <Textarea
          label="Custom CSS"
          rows={7}
          spellCheck={false}
          className={mono}
          placeholder=".site-header { … }"
          hint="Plain CSS, without <style> tags."
          error={errors.custom_css?.message}
          {...register("custom_css")}
        />
        <p className="text-fg-subtle text-xs">
          Only paste code from sources you trust — it runs for every visitor.
        </p>
      </SettingsSection>
    </SettingsForm>
  );
}
