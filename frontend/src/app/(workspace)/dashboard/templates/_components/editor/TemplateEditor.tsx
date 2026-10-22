"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Braces,
  Hash,
  Info,
  LayoutTemplate,
  Lightbulb,
  MousePointerClick,
  PanelTop,
  Save,
  SendHorizontal,
  ShieldCheck,
  TextQuote,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardBody,
  Input,
  RadioGroup,
  Select,
  Switch,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { INBOX_QK } from "../../../_lib/inboxApi";
import { TEMPLATES_QK, templatesApi, type Template, type TemplateInput } from "../../../_lib/templatesApi";
import {
  PhonePreview,
  TemplateBubble,
  type PreviewTemplate,
} from "../../../_components/whatsapp/TemplatePreview";
import { CATEGORIES, LANGUAGES, statusOf } from "../labels";
import { useBusinessName } from "../useBusinessName";
import { BodyField } from "./BodyField";
import { ButtonsField } from "./ButtonsField";
import { HeaderField, type SampleFile } from "./HeaderField";
import { Counter, Section, Segmented } from "./parts";
import { cleanName, groupButtons, LIMITS, validate } from "./rules";

export type TemplateDraft = Omit<TemplateInput, "submit">;

export const BLANK: TemplateDraft = {
  name: "",
  language: "en",
  category: "marketing",
  parameter_format: "positional",
  header: { format: "none", text: null, example: null },
  body: "",
  examples: {},
  footer: null,
  buttons: [],
  add_security_recommendation: true,
  code_expiration_minutes: 10,
};

export function draftOf(t: Template): TemplateDraft {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    parameter_format: t.parameter_format,
    header: t.form.header,
    body: t.form.body,
    examples: t.form.examples,
    footer: t.form.footer,
    buttons: t.form.buttons.filter((b) => b.type !== "other" && b.type !== "otp"),
    add_security_recommendation: t.form.add_security_recommendation,
    code_expiration_minutes: t.form.code_expiration_minutes,
  };
}

function authPreview(d: TemplateDraft): PreviewTemplate {
  return {
    header: { format: "none", text: null },
    body: `*{{1}}* is your verification code.${d.add_security_recommendation ? " For your security, do not share this code." : ""}`,
    footer: d.code_expiration_minutes ? `This code expires in ${d.code_expiration_minutes} minutes.` : null,
    buttons: [{ type: "otp", text: "Copy code" }],
  };
}

const TIPS = [
  "Pick the category that matches the message. Offers sent as Utility get moved to Marketing.",
  "Give every variable a realistic sample value. Meta reviews the message with them.",
  "Don't ask for card numbers, passwords or other sensitive details.",
  "Keep links to your own website, and spell out what the customer gets.",
];

export function TemplateEditor({
  template,
  seed,
  seedSample = null,
}: {
  /** Editing this template (a draft, or one Meta approved, rejected or paused) */
  template?: Template;
  /** Starting values for a new template (library sample or a duplicate) */
  seed?: TemplateDraft;
  seedSample?: SampleFile | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const businessName = useBusinessName();
  const [form, setForm] = useState<TemplateDraft>(() => (template ? draftOf(template) : (seed ?? BLANK)));
  const [sample, setSample] = useState<SampleFile | null>(() =>
    template?.sample
      ? {
          key: null,
          url: templatesApi.sampleUrl(template.sample.path),
          mime: template.sample.mime,
          filename: template.sample.filename,
          size: template.sample.size,
        }
      : seedSample
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const onMeta = !!template?.meta_id;
  const auth = form.category === "authentication";
  const clientErrors = useMemo(() => validate(form, !!sample), [form, sample]);
  const errors = attempted ? { ...clientErrors, ...serverErrors } : serverErrors;
  const issueCount = Object.keys(clientErrors).length;

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (changes: Partial<TemplateDraft>) => {
    setForm((f) => ({ ...f, ...changes }));
    setServerErrors({});
    setDirty(true);
  };

  const upload = async (file: File) => {
    const kind = form.header.format as "image" | "video" | "document";
    setUploading(true);
    try {
      const data = await templatesApi.uploadSample(file, kind);
      if (sample?.url?.startsWith("blob:")) URL.revokeObjectURL(sample.url);
      setSample({
        key: data.key,
        url: URL.createObjectURL(file),
        mime: data.mime,
        filename: data.filename,
        size: data.size,
      });
      setDirty(true);
      setServerErrors({});
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const save = async (submit: boolean) => {
    const name = cleanName(form.name);
    if (submit) {
      setAttempted(true);
      if (issueCount) {
        toast.error(
          issueCount === 1
            ? "Fix the highlighted field first"
            : `Fix the ${issueCount} highlighted fields first`
        );
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>("[aria-invalid='true'], [data-error='true']")
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        );
        return;
      }
    } else if (!name) {
      setServerErrors({ name: "Give the template a name" });
      return;
    }
    const body: TemplateInput = {
      ...form,
      name,
      buttons: groupButtons(form.buttons),
      sample_key: sample?.key ?? null,
      sample_filename: sample?.filename ?? null,
      submit,
    };
    setSaving(submit ? "submit" : "draft");
    try {
      const res = template ? await templatesApi.update(template.id, body) : await templatesApi.create(body);
      toast.success(res.message ?? "Saved");
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_QK.ALL });
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.TEMPLATES });
      router.push(CUSTOMER_ROUTES.TEMPLATES({ action: "edit", id: res.data.id }));
    } catch (err) {
      if (err instanceof CustomerApiError && Object.keys(err.errors).length) {
        setServerErrors(err.errors);
        setAttempted(true);
      }
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const preview: PreviewTemplate = auth
    ? authPreview(form)
    : { header: form.header, body: form.body, footer: form.footer, buttons: form.buttons };
  const values = auth
    ? { body: { "1": "123456" } }
    : {
        header: form.header.example
          ? Object.fromEntries([
              [form.header.text?.match(/\{\{\s*(\w+)\s*\}\}/)?.[1] ?? "1", form.header.example],
            ])
          : {},
        body: form.examples,
      };
  const status = template ? statusOf(template.status) : null;
  const title = template ? template.name : "New template";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={CUSTOMER_ROUTES.TEMPLATES()}
          aria-label="Back to templates"
          className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-fg flex items-center gap-2 truncate text-lg font-semibold">
            <span className="truncate">{title}</span>
            {status && (
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            )}
          </h1>
          <p className="text-fg-subtle truncate text-xs">
            {onMeta
              ? "Changes go to Meta for review again."
              : "Build the message, check the preview, then submit it to Meta."}
          </p>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          {!onMeta && (
            <Button
              variant="secondary"
              leftIcon={Save}
              loading={saving === "draft"}
              disabled={!!saving}
              onClick={() => save(false)}
            >
              <span className="hidden sm:inline">Save draft</span>
              <span className="sm:hidden">Draft</span>
            </Button>
          )}
          <Button
            leftIcon={SendHorizontal}
            loading={saving === "submit"}
            disabled={!!saving}
            onClick={() => save(true)}
          >
            {onMeta ? "Submit changes" : "Submit for review"}
          </Button>
        </div>
      </div>

      {template?.status === "rejected" && (
        <div className="border-danger/30 bg-danger-soft text-danger mb-4 flex gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Meta rejected this template
              {template.rejected_reason
                ? `: ${template.rejected_reason.replace(/_/g, " ").toLowerCase()}`
                : ""}
            </p>
            <p className="opacity-90">
              Fix the message (check the category, variables and wording) and submit it again.
            </p>
          </div>
        </div>
      )}
      {template && ["approved", "paused"].includes(template.status) && (
        <div className="border-line bg-info-soft text-info mb-4 flex gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Editing sends this template back to review; until then it can&apos;t be sent. Meta allows one edit
            a day and 10 in 30 days for approved templates.
          </p>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Section
            title="Template details"
            icon={LayoutTemplate}
            hint="The name is only for you; customers never see it."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="name"
                label="Template name"
                required
                placeholder="order_update"
                value={form.name}
                disabled={onMeta}
                maxLength={LIMITS.name}
                error={errors.name}
                onChange={(e) => patch({ name: e.target.value })}
                onBlur={() => form.name && patch({ name: cleanName(form.name) })}
                hint={
                  form.name && cleanName(form.name) !== form.name
                    ? `Saved as ${cleanName(form.name) || "…"}`
                    : "Lowercase letters, numbers and underscores"
                }
              />
              <Select
                name="language"
                label="Language"
                required
                searchable
                value={form.language}
                disabled={onMeta}
                options={LANGUAGES}
                onChange={(language) => patch({ language })}
                error={errors.language}
              />
            </div>
            <RadioGroup
              label="Category"
              columns={3}
              value={form.category}
              error={errors.category}
              disabled={onMeta && template?.status !== "rejected"}
              onChange={(category) => patch({ category })}
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, description: c.hint }))}
            />
            {!auth && (
              <div>
                <p className="text-fg mb-1.5 text-sm font-medium">Variable type</p>
                <Segmented
                  label="Variable type"
                  value={form.parameter_format}
                  disabled={onMeta}
                  onChange={(parameter_format) => patch({ parameter_format })}
                  options={[
                    { value: "positional", label: "Numbers {{1}}", icon: Hash },
                    { value: "named", label: "Names {{first_name}}", icon: Braces },
                  ]}
                />
              </div>
            )}
          </Section>

          {auth ? (
            <Section
              title="Verification code"
              icon={ShieldCheck}
              hint="Meta writes the text of authentication templates in every language. You choose the extras."
            >
              <Switch
                checked={form.add_security_recommendation}
                onChange={(v) => patch({ add_security_recommendation: v })}
                label="Add a security warning"
                hint={'Adds "For your security, do not share this code."'}
              />
              <Input
                name="code_expiration_minutes"
                type="number"
                min={1}
                max={90}
                label="Code expires after (minutes)"
                value={form.code_expiration_minutes ?? ""}
                error={errors.code_expiration_minutes}
                onChange={(e) =>
                  patch({ code_expiration_minutes: e.target.value ? Number(e.target.value) : null })
                }
                hint="Shown in the footer. Leave empty to hide it."
                wrapperClassName="max-w-xs"
              />
              <p className="text-fg-subtle bg-page border-line rounded-lg border px-3 py-2.5 text-sm">
                The message gets a <strong>Copy code</strong> button. You pass the code each time you send it.
              </p>
            </Section>
          ) : (
            <>
              <Section
                title="Header"
                optional
                icon={PanelTop}
                hint="A bold title, or an image, video, PDF or map above the message."
              >
                <HeaderField
                  header={form.header}
                  format={form.parameter_format}
                  onChange={(header) => {
                    if (header.format !== form.header.format) setSample(null);
                    patch({ header });
                  }}
                  sample={sample}
                  uploading={uploading}
                  onUpload={upload}
                  onRemoveSample={() => {
                    setSample(null);
                    setDirty(true);
                  }}
                  errors={errors}
                />
              </Section>

              <Section title="Body" icon={TextQuote} hint="The main message. Up to 1,024 characters.">
                <BodyField
                  value={form.body}
                  onChange={(body) => patch({ body })}
                  examples={form.examples}
                  onExamples={(examples) => patch({ examples })}
                  format={form.parameter_format}
                  errors={errors}
                />
              </Section>

              <Section
                title="Footer"
                optional
                icon={Type}
                hint="Small grey text under the message, e.g. how to opt out."
              >
                <Input
                  name="footer"
                  label="Footer text"
                  placeholder="Reply STOP to unsubscribe"
                  value={form.footer ?? ""}
                  maxLength={LIMITS.footer + 10}
                  error={errors.footer}
                  onChange={(e) => patch({ footer: e.target.value || null })}
                  hint={
                    <span className="flex justify-between gap-3">
                      <span>No variables or formatting.</span>
                      <Counter value={form.footer} max={LIMITS.footer} />
                    </span>
                  }
                />
              </Section>

              <Section
                title="Buttons"
                optional
                icon={MousePointerClick}
                hint="Up to 10. Quick replies, a website link, a phone call or a coupon code."
              >
                <ButtonsField
                  buttons={form.buttons}
                  onChange={(buttons) => patch({ buttons })}
                  marketing={form.category === "marketing"}
                  errors={errors}
                />
              </Section>
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4" aria-label="Preview">
          <PhonePreview businessName={businessName}>
            <TemplateBubble
              template={preview}
              values={values}
              media={sample ? { url: sample.url, mime: sample.mime, filename: sample.filename } : null}
            />
          </PhonePreview>
          {attempted && issueCount > 0 ? (
            <p
              className="text-danger flex items-center justify-center gap-1.5 text-center text-sm font-medium"
              data-error="true"
            >
              <AlertTriangle className="h-4 w-4" /> {issueCount} {issueCount === 1 ? "thing" : "things"} to
              fix before submitting
            </p>
          ) : (
            <p className="text-fg-subtle text-center text-xs">
              Live preview: this is how customers see it in WhatsApp.
            </p>
          )}
          <Card>
            <CardBody className="space-y-2">
              <p className="text-fg flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-amber-500" /> Get approved faster
              </p>
              <ul className="text-fg-subtle list-disc space-y-1 pl-4 text-xs">
                {TIPS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
