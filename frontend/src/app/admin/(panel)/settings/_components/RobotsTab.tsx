"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, ExternalLink, Info } from "lucide-react";
import { z } from "zod";

import { Textarea } from "@/app/admin/_components/ui/index";
import type { RobotsSettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const schema = z.object({ content: z.string().max(20000) });

export function RobotsTab({ data, canEdit }: TabProps<"robots">) {
  const save = useSaveGroup("robots");
  const form = useForm<RobotsSettings>({ resolver: zodResolver(schema), defaultValues: data });
  const { register, handleSubmit, reset, formState, setError } = form;

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(await save(values));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  const link = "inline-flex items-center gap-1 font-medium text-primary hover:underline";

  return (
    <SettingsForm
      id="settings-robots"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(data)}
    >
      <SettingsSection
        title="Robots.txt"
        description="Tell search engine crawlers which parts of the website they may visit."
        icon={Bot}
      >
        <Textarea
          label="Content"
          rows={12}
          spellCheck={false}
          className="font-mono text-xs"
          error={formState.errors.content?.message}
          {...register("content")}
        />
        <div className="border-info/30 bg-info-soft text-info flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
          <Info size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>
              <code className="font-mono">Disallow: /admin</code> is always added, and the sitemap link is
              appended automatically.
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className={link}>
                View /robots.txt <ExternalLink size={12} />
              </a>
              <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className={link}>
                View /sitemap.xml <ExternalLink size={12} />
              </a>
            </p>
          </div>
        </div>
      </SettingsSection>
    </SettingsForm>
  );
}
