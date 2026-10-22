"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, ShieldAlert, ShieldCheck, Timer } from "lucide-react";
import { z } from "zod";

import { Input, Switch } from "@/app/admin/_components/ui/index";
import type { FirewallSettings } from "@/app/admin/_lib/api/securityApi";
import type { SecuritySettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { BlockedIpsCard } from "./security/BlockedIpsCard";
import { BlockedRequestsCard } from "./security/BlockedRequestsCard";
import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

type SecurityValues = SecuritySettings & FirewallSettings;

const SESSION_DEFAULTS = {
  access_token_minutes: 30,
  refresh_token_days: 7,
  remember_days: 30,
  password_reset_minutes: 60,
};

const FIREWALL_DEFAULTS: FirewallSettings = {
  auto_block: true,
  auto_block_after: 30,
  auto_block_window: 10,
  auto_block_minutes: 60,
  log_days: 30,
};

const int = (min: number, max: number) =>
  z
    .number({ error: "Enter a number" })
    .int("Whole numbers only")
    .min(min, `Minimum ${min}`)
    .max(max, `Maximum ${max}`);

const schema = z.object({
  lockout_enabled: z.boolean(),
  lockout_attempts: int(1, 50),
  lockout_minutes: int(0, 10080),
  idle_minutes: int(0, 1440),
  access_token_minutes: int(5, 1440),
  refresh_token_days: int(1, 90),
  remember_days: int(1, 365),
  password_reset_minutes: int(5, 1440),
  password_min_length: int(6, 72),
  login_per_minute: int(1, 100),
  auto_block: z.boolean(),
  auto_block_after: int(5, 1000),
  auto_block_window: int(1, 1440),
  auto_block_minutes: int(1, 43200),
  log_days: int(1, 365),
});

export function SecurityTab({ data, canEdit }: TabProps<"security">) {
  const save = useSaveGroup("security");
  const initial: SecurityValues = { ...SESSION_DEFAULTS, ...FIREWALL_DEFAULTS, ...data };
  const form = useForm<SecurityValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const { register, control, handleSubmit, reset, formState, setError } = form;
  const errors = formState.errors;
  const lockout = useWatch({ control, name: "lockout_enabled" });
  const autoBlock = useWatch({ control, name: "auto_block" });
  const idle = useWatch({ control, name: "idle_minutes" });
  const num = { valueAsNumber: true } as const;

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset({ ...FIREWALL_DEFAULTS, ...(await save(values)) } as SecurityValues);
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  return (
    <div className="space-y-6">
      <SettingsForm
        id="settings-security"
        canEdit={canEdit}
        dirty={formState.isDirty}
        submitting={formState.isSubmitting}
        onSubmit={onSubmit}
        onReset={() => reset(initial)}
      >
        <SettingsSection
          title="Account lockout"
          description="Sign-in protection against password guessing."
          icon={ShieldCheck}
        >
          <Controller
            control={control}
            name="lockout_enabled"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                disabled={!canEdit}
                label="Lock accounts after repeated failed sign-ins"
                hint="Protects against password guessing."
              />
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Failed attempts before lockout"
              type="number"
              min={1}
              max={50}
              disabled={!lockout}
              error={errors.lockout_attempts?.message}
              {...register("lockout_attempts", num)}
            />
            <Input
              label="Lockout duration (minutes)"
              type="number"
              min={0}
              max={10080}
              disabled={!lockout}
              hint="0 = locked until unlocked by an admin."
              error={errors.lockout_minutes?.message}
              {...register("lockout_minutes", num)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Sessions & passwords"
          description="Idle sign-out, password rules and sign-in rate limits."
          icon={Timer}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Idle sign-out (minutes)"
              type="number"
              min={0}
              max={1440}
              hint={
                idle > 0
                  ? "A “Still there?” warning shows 60 seconds before. Activity in any admin tab counts."
                  : "0 = never sign out idle admins."
              }
              error={errors.idle_minutes?.message}
              {...register("idle_minutes", num)}
            />
            <Input
              label="Minimum password length"
              type="number"
              min={6}
              max={72}
              error={errors.password_min_length?.message}
              {...register("password_min_length", num)}
            />
            <Input
              label="Login attempts per minute"
              type="number"
              min={1}
              max={100}
              hint="Rate limit per IP address."
              error={errors.login_per_minute?.message}
              {...register("login_per_minute", num)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Admin sign-in sessions"
          description="How long admin sign-ins and password reset links stay valid. Changes apply to new sign-ins."
          icon={KeyRound}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Access token lifetime (minutes)"
              type="number"
              min={5}
              max={1440}
              hint="Renewed silently in the background while the admin is active."
              error={errors.access_token_minutes?.message}
              {...register("access_token_minutes", num)}
            />
            <Input
              label="Password reset link expires after (minutes)"
              type="number"
              min={5}
              max={1440}
              error={errors.password_reset_minutes?.message}
              {...register("password_reset_minutes", num)}
            />
            <Input
              label="Stay signed in (days)"
              type="number"
              min={1}
              max={90}
              hint="Sign-ins without “Remember me”."
              error={errors.refresh_token_days?.message}
              {...register("refresh_token_days", num)}
            />
            <Input
              label="“Remember me” lasts (days)"
              type="number"
              min={1}
              max={365}
              error={errors.remember_days?.message}
              {...register("remember_days", num)}
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Automatic blocking"
          icon={ShieldAlert}
          description="Blocks an IP address for a while when it keeps hitting the rate limits."
        >
          <Controller
            control={control}
            name="auto_block"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                disabled={!canEdit}
                label="Block abusive IP addresses automatically"
                hint="Admins get a notification each time. You can unblock from the list below."
              />
            )}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="After (blocked requests)"
              type="number"
              min={5}
              max={1000}
              disabled={!autoBlock}
              error={errors.auto_block_after?.message}
              {...register("auto_block_after", num)}
            />
            <Input
              label="Within (minutes)"
              type="number"
              min={1}
              max={1440}
              disabled={!autoBlock}
              error={errors.auto_block_window?.message}
              {...register("auto_block_window", num)}
            />
            <Input
              label="Block for (minutes)"
              type="number"
              min={1}
              max={43200}
              disabled={!autoBlock}
              error={errors.auto_block_minutes?.message}
              {...register("auto_block_minutes", num)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Keep the blocked-requests log for (days)"
              type="number"
              min={1}
              max={365}
              hint="Older entries are removed automatically."
              error={errors.log_days?.message}
              {...register("log_days", num)}
            />
          </div>
        </SettingsSection>
      </SettingsForm>

      <BlockedIpsCard canEdit={canEdit} />
      <BlockedRequestsCard canEdit={canEdit} />
    </div>
  );
}
