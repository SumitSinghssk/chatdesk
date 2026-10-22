"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  FileText,
  FlaskConical,
  Megaphone,
  Paperclip,
  Save,
  SendHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Input,
  MultiSelect,
  Select,
  Skeleton,
} from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { useDashboard } from "../../../_components/DashboardContext";
import { PhonePreview, TemplateBubble } from "../../../_components/whatsapp/TemplatePreview";
import {
  CAMPAIGNS_QK,
  campaignsApi,
  type Audience,
  type AudiencePreview,
  type Campaign,
  type CampaignInput,
  type CampaignVariables,
  type Segment,
  type VariableSource,
} from "../../../_lib/campaignsApi";
import { CONTACTS_QK, contactsApi } from "../../../_lib/contactsApi";
import { INBOX_QK, inboxApi } from "../../../_lib/inboxApi";
import { templatesApi, type Template } from "../../../_lib/templatesApi";
import { Section, Segmented } from "../../../templates/_components/editor/parts";
import { SAMPLE_ACCEPT } from "../../../templates/_components/editor/HeaderField";
import { categoryLabel, languageName } from "../../../templates/_components/labels";
import { useBusinessName } from "../../../templates/_components/useBusinessName";
import { inr, SEGMENTS } from "../labels";
import { VariableRow } from "./VariableFields";

export const EMPTY_AUDIENCE: Audience = {
  type: "all",
  tags: [],
  tag_match: "any",
  exclude_tags: [],
  contact_ids: [],
  campaign_id: null,
  segment: null,
};
const EMPTY_VARIABLES: CampaignVariables = { header: {}, body: {}, buttons: {} };

export interface CampaignSeed {
  name: string;
  template_id: number | null;
  audience: Audience;
  variables: CampaignVariables;
  header_media: { key: string; url: string; filename: string } | null;
  location: { latitude: string; longitude: string; name: string; address: string };
  when: "now" | "schedule";
  scheduled_at: string; // datetime-local value
}

/** "2026-10-23T10:00" in the browser's time zone for a UTC ISO string. */
export function localInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function seedOf(c: Campaign, copy = false): CampaignSeed {
  return {
    name: copy ? `${c.name} (copy)` : c.name,
    template_id: c.template_id,
    audience: { ...EMPTY_AUDIENCE, ...c.audience },
    variables: { ...EMPTY_VARIABLES, ...c.variables },
    header_media: c.header_media ? { key: c.header_media, url: "", filename: "Uploaded file" } : null,
    location: {
      latitude: c.location ? String(c.location.latitude) : "",
      longitude: c.location ? String(c.location.longitude) : "",
      name: c.location?.name ?? "",
      address: c.location?.address ?? "",
    },
    when: !copy && c.status === "scheduled" ? "schedule" : "now",
    scheduled_at: copy ? "" : localInput(c.scheduled_at),
  };
}

export const BLANK_SEED: CampaignSeed = {
  name: "",
  template_id: null,
  audience: EMPTY_AUDIENCE,
  variables: EMPTY_VARIABLES,
  header_media: null,
  location: { latitude: "", longitude: "", name: "", address: "" },
  when: "now",
  scheduled_at: "",
};

/** Sensible starting values when a template is picked: names from the contact, the rest from samples. */
function defaultVariables(t: Template): CampaignVariables {
  const body: Record<string, VariableSource> = {};
  t.params.body.forEach((name, i) => {
    const looksLikeName =
      /name/.test(name) || (i === 0 && name === "1" && /^(hi|hello|hey|dear)\b/i.test(t.form.body));
    body[name] = looksLikeName
      ? { source: "first_name", value: null, fallback: "there" }
      : { source: "static", value: t.form.examples[name] ?? "", fallback: null };
  });
  const header: Record<string, VariableSource> = {};
  t.params.header.forEach((name) => {
    header[name] = { source: "static", value: t.form.header.example ?? "", fallback: null };
  });
  const buttons: Record<string, VariableSource> = {};
  t.params.buttons.forEach((b) => {
    buttons[String(b.index)] = { source: "static", value: b.example ?? "", fallback: null };
  });
  return { header, body, buttons };
}

export function CampaignBuilder({ campaign, seed }: { campaign?: Campaign; seed: CampaignSeed }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { me } = useDashboard();
  const businessName = useBusinessName();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CampaignSeed>(seed);
  const [formErrors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [testPhone, setTestPhone] = useState(me.phone ?? "");
  const [testing, setTesting] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);

  const { data: templates, error: templatesError } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    staleTime: 60_000,
  });
  const { data: contactStats } = useQuery({
    queryKey: CONTACTS_QK.STATS,
    queryFn: async () => (await contactsApi.stats()).data,
  });
  const { data: attributes } = useQuery({
    queryKey: CONTACTS_QK.ATTRIBUTES,
    queryFn: async () => (await contactsApi.attributes()).data,
  });
  const { data: earlier } = useQuery({
    queryKey: CAMPAIGNS_QK.LIST({ status: "completed,sending,paused,cancelled", per_page: 100 }),
    queryFn: () => campaignsApi.page({ status: "completed,sending,paused,cancelled", per_page: 100 }),
  });

  const template = templates?.find((t) => t.id === state.template_id) ?? null;
  const patch = (changes: Partial<CampaignSeed>) => {
    setState((s) => ({ ...s, ...changes }));
    setErrors({});
  };
  const setAudience = (changes: Partial<Audience>) => patch({ audience: { ...state.audience, ...changes } });
  const setVar = (part: keyof CampaignVariables, name: string, value: VariableSource) =>
    patch({ variables: { ...state.variables, [part]: { ...state.variables[part], [name]: value } } });

  // audience size, cost and personalised samples, refreshed as the form changes
  const previewKey = useDebouncedValue(
    template
      ? JSON.stringify({ template_id: template.id, audience: state.audience, variables: state.variables })
      : null,
    400
  );
  const {
    data: preview,
    error: previewError,
    isFetching: previewing,
  } = useQuery({
    queryKey: ["campaigns", "preview", previewKey],
    queryFn: async () => (await campaignsApi.preview(JSON.parse(previewKey!))).data,
    enabled: !!previewKey,
    placeholderData: (prev) => prev,
    retry: false,
  });
  // the preview call checks the audience too (e.g. a tag picked, a campaign chosen)
  const errors = {
    ...(previewError instanceof CustomerApiError ? previewError.errors : {}),
    ...formErrors,
  };
  const sample = preview?.samples[Math.min(sampleIndex, (preview?.samples.length ?? 1) - 1)] ?? null;

  const chooseTemplate = (id: string) => {
    const t = templates?.find((x) => x.id === Number(id));
    if (!t) return;
    patch({
      template_id: t.id,
      variables: defaultVariables(t),
      header_media: null,
      name: state.name || t.name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    });
  };

  const upload = async (file: File) => {
    if (!template) return;
    setUploading(true);
    try {
      const res = await templatesApi.uploadSample(
        file,
        template.form.header.format as "image" | "video" | "document"
      );
      patch({ header_media: { key: res.key, url: URL.createObjectURL(file), filename: res.filename } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const location = () => {
    const { latitude, longitude, name, address } = state.location;
    if (template?.form.header.format !== "location" || !latitude || !longitude) return null;
    return {
      latitude: Number(latitude),
      longitude: Number(longitude),
      name: name || undefined,
      address: address || undefined,
    };
  };

  const body = (action: CampaignInput["action"]): CampaignInput => ({
    name: state.name.trim(),
    template_id: state.template_id ?? 0,
    audience: state.audience,
    variables: state.variables,
    header_media: state.header_media?.key ?? null,
    location: location(),
    action,
    scheduled_at: state.scheduled_at ? new Date(state.scheduled_at).toISOString() : null,
  });

  const submit = async (action: CampaignInput["action"]) => {
    if (!state.name.trim()) return setErrors({ name: "Name the campaign" });
    if (!state.template_id) return setErrors({ template_id: "Choose a template" });
    if (action === "schedule" && !state.scheduled_at)
      return setErrors({ scheduled_at: "Pick a date and time" });
    if (action === "now") {
      const ok = await confirm({
        title: `Send to ${preview?.eligible ?? 0} ${preview?.eligible === 1 ? "person" : "people"} now?`,
        message: `“${template?.name}” goes out right away. Estimated Meta charge: about ${inr(preview?.cost ?? 0)}.`,
        confirmLabel: "Send now",
        variant: "primary",
      });
      if (!ok) return;
    }
    setSaving(action);
    try {
      const res = campaign
        ? await campaignsApi.update(campaign.id, body(action))
        : await campaignsApi.create(body(action));
      toast.success(res.message ?? "Saved");
      void queryClient.invalidateQueries({ queryKey: CAMPAIGNS_QK.ALL });
      router.push(action === "draft" ? CUSTOMER_ROUTES.CAMPAIGNS() : CUSTOMER_ROUTES.CAMPAIGN(res.data.id));
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const sendTest = async () => {
    if (!template) return;
    setTesting(true);
    try {
      const res = await campaignsApi.test({
        template_id: template.id,
        variables: state.variables,
        header_media: state.header_media?.key ?? null,
        location: location(),
        phone: testPhone,
      });
      toast.success(res.message ?? "Test sent");
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const tagOptions = useMemo(
    () => (contactStats?.tags ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})` })),
    [contactStats]
  );
  const values = sample
    ? {
        header: Object.fromEntries((template?.params.header ?? []).map((n, i) => [n, sample.header[i]])),
        body: Object.fromEntries((template?.params.body ?? []).map((n, i) => [n, sample.body[i]])),
      }
    : undefined;
  const media =
    template?.form.header.format && ["image", "video", "document"].includes(template.form.header.format)
      ? state.header_media?.url
        ? { url: state.header_media.url, filename: state.header_media.filename }
        : template.sample
          ? { url: templatesApi.sampleUrl(template.sample.path), filename: template.sample.filename }
          : null
      : null;
  const ready = !!template && !!preview && preview.eligible > 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={CUSTOMER_ROUTES.CAMPAIGNS()}
          aria-label="Back to campaigns"
          className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-fg truncate text-lg font-semibold">
            {campaign ? `Edit ${campaign.name}` : "New campaign"}
          </h1>
          <p className="text-fg-subtle truncate text-xs">Send an approved template to many people at once.</p>
        </div>
        <Button
          variant="secondary"
          leftIcon={Save}
          loading={saving === "draft"}
          disabled={!!saving}
          onClick={() => submit("draft")}
        >
          Save draft
        </Button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Section
            title="1. Message"
            icon={FileText}
            hint="Campaigns use templates Meta approved. Pick one, or create one first."
          >
            <Input
              name="campaign_name"
              label="Campaign name"
              required
              placeholder="Diwali offer for VIP customers"
              value={state.name}
              maxLength={150}
              error={errors.name}
              onChange={(e) => patch({ name: e.target.value })}
              hint="Only your team sees this."
            />
            <Select
              id="campaign-template"
              label="Template"
              required
              searchable
              value={state.template_id ?? ""}
              placeholder={
                templates?.length === 0 ? "No approved templates yet" : "Choose an approved template"
              }
              options={(templates ?? []).map((t) => ({
                value: t.id,
                label: t.name,
                description: `${categoryLabel(t.category)} · ${languageName(t.language)}`,
              }))}
              error={errors.template_id ?? (templatesError ? errorMessage(templatesError) : undefined)}
              onChange={chooseTemplate}
              hint={
                <span>
                  Need a new one?{" "}
                  <Link
                    href={CUSTOMER_ROUTES.TEMPLATE_NEW()}
                    className="text-primary font-medium hover:underline"
                  >
                    Create a template
                  </Link>
                </span>
              }
            />
          </Section>

          <Section title="2. Audience" icon={Users} hint="Opted-out and blocked contacts are always skipped.">
            <Segmented
              label="Send to"
              value={state.audience.type}
              onChange={(type) => setAudience({ type })}
              options={[
                { value: "all", label: "All contacts" },
                { value: "tags", label: "Contacts with tags" },
                { value: "campaign", label: "Retarget a campaign" },
                ...(state.audience.type === "contacts"
                  ? [{ value: "contacts" as const, label: "Selected contacts" }]
                  : []),
              ]}
            />
            {state.audience.type === "tags" && (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <MultiSelect
                  id="audience-tags"
                  label="Tags"
                  options={tagOptions}
                  value={state.audience.tags}
                  onChange={(tags) => setAudience({ tags })}
                  placeholder={tagOptions.length ? "Choose tags" : "No tags yet. Add them on Contacts."}
                  error={errors["audience.tags"]}
                />
                <Select
                  id="audience-match"
                  label="Match"
                  value={state.audience.tag_match}
                  options={[
                    { value: "any", label: "Any of these tags" },
                    { value: "all", label: "All of these tags" },
                  ]}
                  onChange={(tag_match) => setAudience({ tag_match: tag_match as Audience["tag_match"] })}
                />
              </div>
            )}
            {state.audience.type === "campaign" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  id="audience-campaign"
                  label="Earlier campaign"
                  searchable
                  value={state.audience.campaign_id ?? ""}
                  placeholder={earlier?.items.length ? "Choose a campaign" : "No sent campaigns yet"}
                  options={(earlier?.items ?? [])
                    .filter((c) => c.id !== campaign?.id)
                    .map((c) => ({ value: c.id, label: c.name }))}
                  error={errors["audience.campaign_id"]}
                  onChange={(v) =>
                    setAudience({ campaign_id: Number(v), segment: state.audience.segment ?? "not_read" })
                  }
                />
                <Select
                  id="audience-segment"
                  label="People who"
                  value={state.audience.segment ?? "not_read"}
                  options={SEGMENTS.map((s) => ({ value: s.value, label: s.label, description: s.hint }))}
                  onChange={(segment) => setAudience({ segment: segment as Segment })}
                />
              </div>
            )}
            {state.audience.type === "contacts" && (
              <p className="text-fg-subtle text-sm">
                {state.audience.contact_ids.length} contacts picked on the Contacts page.
              </p>
            )}
            {state.audience.type !== "contacts" && (
              <MultiSelect
                id="audience-exclude"
                label="Leave out contacts with these tags"
                options={tagOptions}
                value={state.audience.exclude_tags}
                onChange={(exclude_tags) => setAudience({ exclude_tags })}
                placeholder="Optional"
              />
            )}
            <AudienceSummary template={template} loading={previewing} preview={preview} />
          </Section>

          {template && (
            <Section
              title="3. Personalise"
              icon={Sparkles}
              hint="Fill each variable from the contact's details, or use the same text for everyone."
            >
              {template.params.header.map((n) => (
                <VariableRow
                  key={`h${n}`}
                  id={`var-header-${n}`}
                  label={`Header {{${n}}}`}
                  value={state.variables.header[n] ?? { source: "static", value: "", fallback: null }}
                  onChange={(v) => setVar("header", n, v)}
                  attributes={attributes ?? []}
                  error={errors[`variables.header.${n}`]}
                />
              ))}
              {template.params.body.map((n) => (
                <VariableRow
                  key={`b${n}`}
                  id={`var-body-${n}`}
                  label={template.category === "authentication" ? "Code" : `{{${n}}}`}
                  value={state.variables.body[n] ?? { source: "static", value: "", fallback: null }}
                  onChange={(v) => setVar("body", n, v)}
                  attributes={attributes ?? []}
                  error={errors[`variables.body.${n}`]}
                  placeholder={template.form.examples[n]}
                />
              ))}
              {template.params.buttons.map((b) => (
                <VariableRow
                  key={`btn${b.index}`}
                  id={`var-button-${b.index}`}
                  label={b.type === "copy_code" ? "Offer code" : `${b.label} link`}
                  value={
                    state.variables.buttons[String(b.index)] ?? {
                      source: "static",
                      value: "",
                      fallback: null,
                    }
                  }
                  onChange={(v) => setVar("buttons", String(b.index), v)}
                  attributes={attributes ?? []}
                  error={errors[`variables.buttons.${b.index}`]}
                  placeholder={b.example}
                />
              ))}
              {["image", "video", "document"].includes(template.form.header.format) && (
                <div className="border-line bg-page flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Paperclip className="text-fg-faint h-4 w-4 shrink-0" />
                  <span className="text-fg-subtle min-w-0 flex-1 truncate">
                    {state.header_media
                      ? state.header_media.filename
                      : template.sample
                        ? `Header ${template.form.header.format}: ${template.sample.filename ?? "template sample"}`
                        : `Choose a ${template.form.header.format === "document" ? "PDF" : template.form.header.format}`}
                  </span>
                  {state.header_media && (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leftIcon={X}
                      aria-label="Use the template's file"
                      onClick={() => patch({ header_media: null })}
                    />
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept={SAMPLE_ACCEPT[template.form.header.format]}
                    aria-label="Campaign header file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    Change
                  </Button>
                </div>
              )}
              {template.form.header.format === "location" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["latitude", "longitude", "name", "address"] as const).map((k) => (
                    <Input
                      key={k}
                      name={`location_${k}`}
                      label={
                        {
                          latitude: "Latitude",
                          longitude: "Longitude",
                          name: "Place name",
                          address: "Address",
                        }[k]
                      }
                      value={state.location[k]}
                      error={k === "latitude" ? errors.location : undefined}
                      onChange={(e) => patch({ location: { ...state.location, [k]: e.target.value } })}
                    />
                  ))}
                </div>
              )}
              {!template.params.header.length &&
                !template.params.body.length &&
                !template.params.buttons.length &&
                template.form.header.format !== "location" && (
                  <p className="text-fg-subtle text-sm">This template has nothing to personalise.</p>
                )}
            </Section>
          )}

          <Section
            title="4. Send"
            icon={Megaphone}
            hint="Send now, or pick a time. Scheduled campaigns can be edited until they start."
          >
            <Segmented
              label="When"
              value={state.when}
              onChange={(when) => patch({ when })}
              options={[
                { value: "now", label: "Send now", icon: SendHorizontal },
                { value: "schedule", label: "Schedule", icon: CalendarClock },
              ]}
            />
            {state.when === "schedule" && (
              <Input
                name="scheduled_at"
                type="datetime-local"
                label="Send at"
                value={state.scheduled_at}
                min={localInput(new Date().toISOString())}
                error={errors.scheduled_at}
                onChange={(e) => patch({ scheduled_at: e.target.value })}
                hint="Your browser's time zone."
                wrapperClassName="max-w-xs"
              />
            )}
            <div className="border-line rounded-lg border border-dashed p-3">
              <p className="text-fg mb-2 flex items-center gap-1.5 text-sm font-medium">
                <FlaskConical className="text-primary h-4 w-4" /> Send yourself a test first
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  name="test_phone"
                  type="tel"
                  label="WhatsApp number"
                  placeholder="+91 98765 43210"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  wrapperClassName="min-w-48 flex-1"
                />
                <Button
                  variant="secondary"
                  leftIcon={FlaskConical}
                  loading={testing}
                  disabled={!template || !testPhone.trim()}
                  onClick={sendTest}
                >
                  Send test
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {state.when === "schedule" ? (
                <Button
                  leftIcon={CalendarClock}
                  loading={saving === "schedule"}
                  disabled={!!saving || !ready}
                  onClick={() => submit("schedule")}
                >
                  Schedule campaign
                </Button>
              ) : (
                <Button
                  leftIcon={SendHorizontal}
                  loading={saving === "now"}
                  disabled={!!saving || !ready}
                  onClick={() => submit("now")}
                >
                  Send to {preview?.eligible ?? 0} {preview?.eligible === 1 ? "person" : "people"}
                </Button>
              )}
            </div>
          </Section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4" aria-label="Preview">
          {template ? (
            <PhonePreview businessName={businessName}>
              <TemplateBubble template={template.form} values={values} media={media} />
            </PhonePreview>
          ) : (
            <Card>
              <CardBody className="text-fg-subtle py-16 text-center text-sm">
                Pick a template to see the message.
              </CardBody>
            </Card>
          )}
          {preview && preview.samples.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 text-xs">
              <span className="text-fg-subtle">Preview for</span>
              {preview.samples.map((s, i) => (
                <button
                  key={s.contact.id}
                  type="button"
                  onClick={() => setSampleIndex(i)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium transition",
                    i === Math.min(sampleIndex, preview.samples.length - 1)
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line text-fg-subtle hover:text-fg"
                  )}
                >
                  {s.contact.name?.split(" ")[0] || s.contact.phone}
                </button>
              ))}
            </div>
          )}
          {sample && sample.missing.length > 0 && (
            <p className="text-warning flex items-center justify-center gap-1 text-center text-xs">
              <AlertTriangle className="h-3.5 w-3.5" /> No value for {sample.missing.join(", ")}: add a
              fallback
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function AudienceSummary({
  template,
  loading,
  preview,
}: {
  template: Template | null;
  loading: boolean;
  preview: AudiencePreview | undefined;
}) {
  if (!template)
    return <p className="text-fg-subtle text-sm">Pick a template to see who gets it and the cost.</p>;
  if (!preview) return <Skeleton className="h-20" />;
  return (
    <div
      className={cn("bg-page border-line rounded-lg border p-3 transition", loading && "opacity-60")}
      aria-live="polite"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Will receive" value={preview.eligible} strong />
        <Fact label="Opted out" value={preview.opted_out} />
        <Fact label="Blocked" value={preview.blocked} />
        <Fact label="Estimated cost" value={inr(preview.cost)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge>{categoryLabel(preview.category)} rate</Badge>
        {preview.missing_values > 0 && <Badge tone="warning">{preview.missing_values} missing a value</Badge>}
        {preview.over_limit && (
          <Badge tone="danger">Over your daily limit of {preview.daily_limit} new chats</Badge>
        )}
      </div>
      {preview.over_limit && (
        <p className="text-fg-subtle mt-2 text-xs">
          Meta lets your number start {preview.daily_limit} new conversations a day. The rest fail until the
          limit grows (it rises as you send good-quality messages).
        </p>
      )}
      <p className="text-fg-faint mt-2 text-[11px]">
        Cost is an estimate from Meta&apos;s per-message prices; your Meta invoice is final.
      </p>
    </div>
  );
}

function Fact({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
  return (
    <div>
      <p className="text-fg-subtle text-xs">{label}</p>
      <p
        className={cn(
          "tabular",
          strong ? "text-primary text-xl font-bold" : "text-fg text-base font-semibold"
        )}
      >
        {value}
      </p>
    </div>
  );
}
