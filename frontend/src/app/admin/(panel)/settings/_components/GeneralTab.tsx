"use client";

import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AtSign, Building2, MapPin, PanelBottom, Phone, Plus, Share2, Trash2 } from "lucide-react";
import { z } from "zod";

import { Button, ImageField, Input, Select, Textarea } from "@/app/admin/_components/ui/index";
import type { GeneralSettings } from "@/app/admin/_lib/api/settingsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";

import { SettingsForm, SettingsSection, useSaveGroup, type TabProps } from "./SettingsForm";

const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X (Twitter)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "github", label: "GitHub" },
  { value: "whatsapp", label: "WhatsApp" },
];

const schema = z.object({
  app_name: z.string().trim().min(1, "Business name is required").max(150),
  tagline: z.string().max(255),
  logo_light: z.string().nullable(),
  logo_dark: z.string().nullable(),
  favicon: z.string().nullable(),
  addresses: z.array(
    z.object({
      label: z.string().max(100),
      text: z.string().max(500),
      map_iframe: z.string().max(5000),
    })
  ),
  phones: z.array(z.object({ value: z.string().trim().max(30) })),
  emails: z.array(
    z.object({
      value: z
        .string()
        .trim()
        .refine((v) => !v || z.email().safeParse(v).success, "Invalid email"),
    })
  ),
  social_links: z.array(
    z.object({ platform: z.string().min(1), url: z.string().trim().min(1, "URL is required").max(500) })
  ),
  footer_text: z.string().max(500),
});
type Values = z.infer<typeof schema>;

const toValues = (d: GeneralSettings): Values => ({
  app_name: d.app_name ?? "",
  tagline: d.tagline ?? "",
  logo_light: d.logo_light,
  logo_dark: d.logo_dark,
  favicon: d.favicon,
  addresses: (d.addresses ?? []).map((a) => ({
    label: a.label ?? "",
    text: a.text ?? "",
    map_iframe: a.map_iframe ?? "",
  })),
  phones: (d.phones ?? []).map((value) => ({ value })),
  emails: (d.emails ?? []).map((value) => ({ value })),
  social_links: (d.social_links ?? []).map((s) => ({ platform: s.platform, url: s.url })),
  footer_text: d.footer_text ?? "",
});

const toPayload = (v: Values): GeneralSettings => ({
  ...v,
  addresses: v.addresses
    .filter((a) => a.label.trim() || a.text.trim())
    .map((a) => ({ label: a.label.trim(), text: a.text.trim(), map_iframe: a.map_iframe.trim() || null })),
  phones: v.phones.map((p) => p.value).filter(Boolean),
  emails: v.emails.map((e) => e.value).filter(Boolean),
});

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      leftIcon={Trash2}
      aria-label={label}
      title={label}
      className="hover:bg-danger-soft hover:text-danger shrink-0"
      onClick={onClick}
    />
  );
}

export function GeneralTab({ data, canEdit }: TabProps<"general">) {
  const save = useSaveGroup("general");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(data) });
  const { register, control, handleSubmit, reset, formState, setError } = form;
  const errors = formState.errors;
  const addresses = useFieldArray({ control, name: "addresses" });
  const phones = useFieldArray({ control, name: "phones" });
  const emails = useFieldArray({ control, name: "emails" });
  const socials = useFieldArray({ control, name: "social_links" });

  const onSubmit = handleSubmit(async (values) => {
    try {
      reset(toValues(await save(toPayload(values))));
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save settings");
    }
  });

  const addButton = (label: string, onClick: () => void) =>
    canEdit && (
      <Button size="sm" variant="secondary" leftIcon={Plus} onClick={onClick}>
        {label}
      </Button>
    );

  return (
    <SettingsForm
      id="settings-general"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(toValues(data))}
      note="Saves the whole business profile: identity, addresses, contact, social and footer."
    >
      <SettingsSection
        title="Identity"
        description="Name and branding shown across the website."
        icon={Building2}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" required error={errors.app_name?.message} {...register("app_name")} />
          <Input label="Tagline" error={errors.tagline?.message} {...register("tagline")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["logo_light", "Logo (light background)"],
              ["logo_dark", "Logo (dark background)"],
              ["favicon", "Favicon"],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field }) => (
                <ImageField
                  label={label}
                  value={field.value}
                  onChange={(url) => field.onChange(url)}
                  folder="branding"
                  aspect={name === "favicon" ? "aspect-square max-w-[140px]" : "aspect-[3/1]"}
                  hint={
                    name === "favicon"
                      ? "Square PNG, 64 × 64 or larger."
                      : "PNG or SVG with a transparent background."
                  }
                />
              )}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Addresses"
        icon={MapPin}
        description="Office or store locations. Paste a Google Maps embed code to show a map."
        actions={addButton("Add address", () => addresses.append({ label: "", text: "", map_iframe: "" }))}
      >
        {addresses.fields.length === 0 && <p className="text-fg-subtle text-xs">No addresses added.</p>}
        {addresses.fields.map((field, i) => (
          <div key={field.id} className="border-line bg-page space-y-3 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <Input
                label="Label"
                placeholder="Head office"
                wrapperClassName="flex-1"
                {...register(`addresses.${i}.label`)}
              />
              {canEdit && (
                <div className="pt-6">
                  <RemoveButton label={`Remove address ${i + 1}`} onClick={() => addresses.remove(i)} />
                </div>
              )}
            </div>
            <Textarea label="Address" rows={2} {...register(`addresses.${i}.text`)} />
            <Textarea
              label="Map embed (iframe)"
              rows={2}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder='<iframe src="https://www.google.com/maps/embed?..."></iframe>'
              {...register(`addresses.${i}.map_iframe`)}
            />
          </div>
        ))}
      </SettingsSection>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <SettingsSection
          title="Phone numbers"
          icon={Phone}
          actions={addButton("Add", () => phones.append({ value: "" }))}
        >
          {phones.fields.length === 0 && <p className="text-fg-subtle text-xs">No phone numbers.</p>}
          {phones.fields.map((field, i) => (
            <div key={field.id} className="flex items-start gap-2">
              <Input
                aria-label={`Phone ${i + 1}`}
                type="tel"
                placeholder="+91 98765 43210"
                wrapperClassName="flex-1"
                error={errors.phones?.[i]?.value?.message}
                {...register(`phones.${i}.value`)}
              />
              {canEdit && <RemoveButton label={`Remove phone ${i + 1}`} onClick={() => phones.remove(i)} />}
            </div>
          ))}
        </SettingsSection>
        <SettingsSection
          title="Email addresses"
          icon={AtSign}
          actions={addButton("Add", () => emails.append({ value: "" }))}
        >
          {emails.fields.length === 0 && <p className="text-fg-subtle text-xs">No email addresses.</p>}
          {emails.fields.map((field, i) => (
            <div key={field.id} className="flex items-start gap-2">
              <Input
                aria-label={`Email ${i + 1}`}
                type="email"
                placeholder="hello@example.com"
                wrapperClassName="flex-1"
                error={errors.emails?.[i]?.value?.message}
                {...register(`emails.${i}.value`)}
              />
              {canEdit && <RemoveButton label={`Remove email ${i + 1}`} onClick={() => emails.remove(i)} />}
            </div>
          ))}
        </SettingsSection>
      </div>

      <SettingsSection
        title="Social links"
        icon={Share2}
        actions={addButton("Add link", () => socials.append({ platform: "facebook", url: "" }))}
      >
        {socials.fields.length === 0 && <p className="text-fg-subtle text-xs">No social links.</p>}
        {socials.fields.map((field, i) => (
          <div key={field.id} className="flex items-start gap-2">
            <Controller
              control={control}
              name={`social_links.${i}.platform`}
              render={({ field: platform }) => (
                <Select
                  aria-label={`Platform ${i + 1}`}
                  options={PLATFORMS}
                  value={platform.value}
                  onChange={platform.onChange}
                  onBlur={platform.onBlur}
                  name={platform.name}
                  wrapperClassName="w-36 shrink-0 sm:w-44"
                />
              )}
            />
            <Input
              aria-label={`URL ${i + 1}`}
              type="url"
              placeholder="https://"
              wrapperClassName="min-w-0 flex-1"
              error={errors.social_links?.[i]?.url?.message}
              {...register(`social_links.${i}.url`)}
            />
            {canEdit && <RemoveButton label={`Remove link ${i + 1}`} onClick={() => socials.remove(i)} />}
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title="Footer" icon={PanelBottom}>
        <Input
          label="Footer text"
          placeholder="All rights reserved."
          error={errors.footer_text?.message}
          {...register("footer_text")}
        />
      </SettingsSection>
    </SettingsForm>
  );
}
