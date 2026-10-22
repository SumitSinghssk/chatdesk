"use client";

import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessagesSquare, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { Input, Switch } from "@/app/admin/_components/ui/index";
import type { CommentsSettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { ADMIN_ROUTES } from "@/config/routes";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const int = (min: number, max: number) =>
  z
    .number({ error: "Enter a number" })
    .int("Whole numbers only")
    .min(min, `Minimum ${min}`)
    .max(max, `Maximum ${max}`);

const schema = z.object({
  enabled: z.boolean(),
  allow_replies: z.boolean(),
  max_depth: int(1, 5),
  notify_admins: z.boolean(),
  close_after_days: int(0, 3650),
});
type Values = z.infer<typeof schema>;

const toValues = (d: CommentsSettings): Values => ({
  enabled: d.enabled,
  allow_replies: d.allow_replies,
  max_depth: d.max_depth,
  notify_admins: d.notify_admins,
  close_after_days: d.close_after_days,
});

export function CommentsTab({ data, canEdit }: TabProps<"comments">) {
  const save = useSaveGroup("comments");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(data) });
  const { register, control, handleSubmit, reset, formState, setError } = form;
  const errors = formState.errors;
  const enabled = useWatch({ control, name: "enabled" });
  const replies = useWatch({ control, name: "allow_replies" });
  const num = { valueAsNumber: true } as const;

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(toValues(await save(values)));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  return (
    <SettingsForm
      id="settings-comments"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(toValues(data))}
    >
      <SettingsSection
        title="Blog comments"
        description="Let visitors comment on blog posts. Each post can also turn comments off on its own."
        icon={MessagesSquare}
      >
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Enable comments on the website"
              hint="When off, no comments or comment forms are shown on any post."
            />
          )}
        />
        <Controller
          control={control}
          name="allow_replies"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit || !enabled}
              label="Allow visitors to reply to comments"
              hint="Shows a Reply button under each approved comment."
            />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Reply depth"
            type="number"
            min={1}
            max={5}
            disabled={!enabled || !replies}
            hint="How many levels a conversation can go (1 = no replies to replies)."
            error={errors.max_depth?.message}
            {...register("max_depth", num)}
          />
          <Input
            label="Close comments after (days)"
            type="number"
            min={0}
            max={3650}
            disabled={!enabled}
            hint="Stop new comments on older posts. 0 = never close."
            error={errors.close_after_days?.message}
            {...register("close_after_days", num)}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Moderation"
        description="Every new comment waits for approval and is only shown on the website once approved."
        icon={ShieldCheck}
      >
        <Controller
          control={control}
          name="notify_admins"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Notify the team about new comments"
              hint="Sends an in-app notification to everyone who can view comments."
            />
          )}
        />
        <p className="text-fg-subtle text-sm">
          Review, approve and reply to comments in{" "}
          <Link href={ADMIN_ROUTES.COMMENTS()} className="text-primary font-medium hover:underline">
            Comments
          </Link>
          .
        </p>
      </SettingsSection>
    </SettingsForm>
  );
}
