"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AtSign, Mail, Send, Server } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button, Input, Section, Select, Switch } from "@/app/admin/_components/ui/index";
import { settingsApi, type MailEncryption, type MailSettings } from "@/app/admin/_lib/api/settingsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const PRESETS: Record<
  string,
  { label: string; host: string; port: number; encryption: MailEncryption } | null
> = {
  custom: null,
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 587, encryption: "tls" },
  outlook: { label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, encryption: "tls" },
  zoho: { label: "Zoho Mail", host: "smtp.zoho.com", port: 465, encryption: "ssl" },
  sendgrid: { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, encryption: "tls" },
  mailgun: { label: "Mailgun", host: "smtp.mailgun.org", port: 587, encryption: "tls" },
  brevo: { label: "Brevo", host: "smtp-relay.brevo.com", port: 587, encryption: "tls" },
  hostinger: { label: "Hostinger", host: "smtp.hostinger.com", port: 465, encryption: "ssl" },
};
const PRESET_OPTIONS = Object.entries(PRESETS).map(([value, p]) => ({
  value,
  label: p?.label ?? "Custom SMTP",
}));

const ENCRYPTION_OPTIONS = [
  { value: "tls", label: "TLS (STARTTLS)", description: "Usually port 587" },
  { value: "ssl", label: "SSL", description: "Usually port 465" },
  { value: "none", label: "None", description: "Not recommended" },
];

const presetFor = (host: string) =>
  Object.entries(PRESETS).find(([, p]) => p && p.host === host.trim().toLowerCase())?.[0] ?? "custom";

const optionalEmail = z
  .string()
  .trim()
  .max(255)
  .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address");

const schema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(255),
  port: z.number({ error: "Enter a port" }).int().min(1).max(65535),
  encryption: z.enum(["tls", "ssl", "none"]),
  username: z.string().trim().max(255),
  password: z.string().max(500),
  from_address: optionalEmail,
  from_name: z.string().trim().max(150),
  reply_to: optionalEmail,
});
type Values = z.infer<typeof schema>;

const toValues = (d: MailSettings): Values => ({
  enabled: d.enabled,
  host: d.host ?? "",
  port: d.port ?? 587,
  encryption: d.encryption ?? "tls",
  username: d.username ?? "",
  password: "",
  from_address: d.from_address ?? "",
  from_name: d.from_name ?? "",
  reply_to: d.reply_to ?? "",
});

export function MailTab({ data, canEdit }: TabProps<"mail">) {
  const save = useSaveGroup("mail");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(data) });
  const { register, control, handleSubmit, reset, formState, setError, setValue } = form;
  const errors = formState.errors;
  const [preset, setPreset] = useState(() => presetFor(data.host ?? ""));
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save({ ...values, password: values.password || null });
      reset(toValues(saved));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  const applyPreset = (key: string) => {
    setPreset(key);
    const p = PRESETS[key];
    if (!p) return;
    setValue("host", p.host, { shouldDirty: true });
    setValue("port", p.port, { shouldDirty: true });
    setValue("encryption", p.encryption, { shouldDirty: true });
  };

  const sendTest = async () => {
    if (!z.email().safeParse(testTo.trim()).success) {
      toast.error("Enter a valid email address to send the test to");
      return;
    }
    setTesting(true);
    try {
      const res = await settingsApi.mailTest(testTo.trim());
      toast.success(res.message ?? "Test email sent");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send the test email"));
    } finally {
      setTesting(false);
    }
  };

  const num = { valueAsNumber: true } as const;

  return (
    <div className="space-y-5">
      <SettingsForm
        id="settings-mail"
        canEdit={canEdit}
        dirty={formState.isDirty}
        submitting={formState.isSubmitting}
        onSubmit={onSubmit}
        onReset={() => {
          reset(toValues(data));
          setPreset(presetFor(data.host ?? ""));
        }}
      >
        <SettingsSection
          title="Email (SMTP)"
          description="Outgoing mail for enquiry replies, password resets and notifications."
          icon={Mail}
        >
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                disabled={!canEdit}
                label="Send email"
                hint="When off, no emails are sent (replies and tests will fail)."
              />
            )}
          />
        </SettingsSection>

        <SettingsSection title="Server" description="Where outgoing mail is sent from." icon={Server}>
          <Select
            label="Provider"
            value={preset}
            onChange={applyPreset}
            options={PRESET_OPTIONS}
            hint="Fills in the host, port and encryption for common providers."
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_120px_160px]">
            <Input
              label="Host"
              placeholder="smtp.example.com"
              error={errors.host?.message}
              {...register("host", { onChange: () => setPreset("custom") })}
            />
            <Input
              label="Port"
              type="number"
              min={1}
              max={65535}
              error={errors.port?.message}
              {...register("port", num)}
            />
            <Controller
              control={control}
              name="encryption"
              render={({ field, fieldState }) => (
                <Select
                  label="Encryption"
                  options={ENCRYPTION_OPTIONS}
                  value={field.value}
                  onChange={(v) => field.onChange(v as MailEncryption)}
                  onBlur={field.onBlur}
                  name={field.name}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Username"
              autoComplete="off"
              error={errors.username?.message}
              {...register("username")}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder={data.has_password ? "•••••• (saved)" : ""}
              hint={
                data.has_password
                  ? "Leave blank to keep the saved password."
                  : "App password for Gmail / Outlook."
              }
              error={errors.password?.message}
              {...register("password")}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Sender" description="Who the emails appear to come from." icon={AtSign}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="From address"
              type="email"
              placeholder="no-reply@example.com"
              error={errors.from_address?.message}
              {...register("from_address")}
            />
            <Input label="From name" error={errors.from_name?.message} {...register("from_name")} />
            <Input label="Reply-to" type="email" error={errors.reply_to?.message} {...register("reply_to")} />
          </div>
        </SettingsSection>
      </SettingsForm>

      {canEdit && (
        <Section
          title="Send a test email"
          icon={Send}
          description={
            <>
              Uses the <b>saved</b> settings{formState.isDirty ? " — save your changes first" : ""}.
            </>
          }
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Send test to"
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendTest();
                }
              }}
              wrapperClassName="flex-1 sm:max-w-sm"
            />
            <Button
              variant="secondary"
              leftIcon={Send}
              loading={testing}
              disabled={!testTo.trim()}
              onClick={sendTest}
            >
              Send test
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}
