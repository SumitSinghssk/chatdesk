"use client";

import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, MessageSquareText, TriangleAlert, UserRoundPlus } from "lucide-react";
import { z } from "zod";

import { Input, Switch } from "@/app/admin/_components/ui/index";
import type { CustomerAuthSettings } from "@/app/admin/_lib/api/settingsApi";
import { smsApi } from "@/app/admin/_lib/api/smsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { ADMIN_ROUTES } from "@/config/routes";
import { QK } from "@/config/query-keys";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const int = (min: number, max: number) =>
  z
    .number({ error: "Enter a number" })
    .int("Whole numbers only")
    .min(min, `Minimum ${min}`)
    .max(max, `Maximum ${max}`);

const schema = z
  .object({
    password_enabled: z.boolean(),
    otp_enabled: z.boolean(),
    google_enabled: z.boolean(),
    allow_registration: z.boolean(),
    google_client_id: z.string().trim().max(255),
    otp_length: int(4, 8),
    otp_expiry_minutes: int(1, 30),
    otp_resend_seconds: int(10, 600),
    otp_max_attempts: int(1, 10),
    session_days: int(1, 365),
  })
  .refine((v) => v.password_enabled || v.otp_enabled || v.google_enabled, {
    path: ["password_enabled"],
    message: "Keep at least one sign-in method turned on",
  })
  .refine((v) => !v.google_enabled || v.google_client_id, {
    path: ["google_client_id"],
    message: "Add the Google client ID to turn on Google sign-in",
  });
type Values = z.infer<typeof schema>;

const toValues = (d: CustomerAuthSettings): Values => ({
  password_enabled: d.password_enabled,
  otp_enabled: d.otp_enabled,
  google_enabled: d.google_enabled,
  allow_registration: d.allow_registration,
  google_client_id: d.google_client_id ?? "",
  otp_length: d.otp_length,
  otp_expiry_minutes: d.otp_expiry_minutes,
  otp_resend_seconds: d.otp_resend_seconds,
  otp_max_attempts: d.otp_max_attempts,
  session_days: d.session_days,
});

export function CustomerLoginTab({ data, canEdit }: TabProps<"customer_auth">) {
  const save = useSaveGroup("customer_auth");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(data) });
  const { register, control, handleSubmit, reset, formState, setError } = form;
  const errors = formState.errors;
  const otp = useWatch({ control, name: "otp_enabled" });
  const google = useWatch({ control, name: "google_enabled" });
  const num = { valueAsNumber: true } as const;
  const { data: sms } = useQuery({ queryKey: [QK.SMS], queryFn: smsApi.show, enabled: otp });
  const smsReady = !!sms && sms.settings.order.some((k) => sms.settings.gateways[k]?.enabled);

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(toValues(await save(values)));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <SettingsForm
      id="settings-customer-auth"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(toValues(data))}
    >
      <SettingsSection
        title="Sign-in methods"
        description="Choose how customers sign in on the website's login page. Turn on more than one to let them pick."
        icon={KeyRound}
      >
        <Controller
          control={control}
          name="password_enabled"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Email or mobile with password"
              hint="Customers sign in with their email or mobile number and a password."
            />
          )}
        />
        {errors.password_enabled && <p className="text-danger text-xs">{errors.password_enabled.message}</p>}
        <Controller
          control={control}
          name="otp_enabled"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Mobile number with one-time code (OTP)"
              hint="We text a code to the customer's phone using your SMS gateways."
            />
          )}
        />
        {otp && sms && !smsReady && (
          <p className="border-warning/30 bg-warning-soft text-warning flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              No SMS gateway is turned on yet, so codes can&apos;t be sent.{" "}
              <Link href={ADMIN_ROUTES.SETTINGS({ tab: "sms" })} className="font-medium underline">
                Set up SMS gateways
              </Link>
            </span>
          </p>
        )}
        <Controller
          control={control}
          name="google_enabled"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Sign in with Google"
              hint="Customers use their Google account. Needs a Google OAuth client ID."
            />
          )}
        />
        {google && (
          <div className="space-y-2">
            <Input
              label="Google client ID"
              placeholder="1234567890-abc.apps.googleusercontent.com"
              error={errors.google_client_id?.message}
              {...register("google_client_id")}
            />
            <p className="text-fg-subtle text-xs leading-relaxed">
              Create an OAuth client (type <b>Web application</b>) in Google Cloud Console → APIs &amp;
              Services → Credentials. Add <code className="text-fg">{origin || "https://your-site.com"}</code>{" "}
              under <b>Authorised JavaScript origins</b>.
            </p>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Sign-ups"
        description="New accounts are created the first time someone signs in with OTP or Google, or registers with a password."
        icon={UserRoundPlus}
      >
        <Controller
          control={control}
          name="allow_registration"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              label="Allow new customers to sign up"
              hint="When off, only existing customers can sign in. Add customers from the Customers page."
            />
          )}
        />
        <Input
          label="Stay signed in for (days)"
          type="number"
          min={1}
          max={365}
          wrapperClassName="sm:max-w-xs"
          error={errors.session_days?.message}
          {...register("session_days", num)}
        />
      </SettingsSection>

      <SettingsSection
        title="One-time codes"
        description="How OTP codes behave. The message text is set in SMS gateways → Message templates."
        icon={MessageSquareText}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Code length"
            type="number"
            min={4}
            max={8}
            disabled={!otp}
            error={errors.otp_length?.message}
            {...register("otp_length", num)}
          />
          <Input
            label="Code expires after (minutes)"
            type="number"
            min={1}
            max={30}
            disabled={!otp}
            error={errors.otp_expiry_minutes?.message}
            {...register("otp_expiry_minutes", num)}
          />
          <Input
            label="Wait before resending (seconds)"
            type="number"
            min={10}
            max={600}
            disabled={!otp}
            error={errors.otp_resend_seconds?.message}
            {...register("otp_resend_seconds", num)}
          />
          <Input
            label="Wrong attempts allowed"
            type="number"
            min={1}
            max={10}
            disabled={!otp}
            hint="After this, the customer must request a new code."
            error={errors.otp_max_attempts?.message}
            {...register("otp_max_attempts", num)}
          />
        </div>
      </SettingsSection>
    </SettingsForm>
  );
}
