"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Eye, Mail, MailOpen, Palette, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ColorInput,
  EmptyState,
  ErrorBanner,
  Input,
  Skeleton,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import {
  emailTemplatesApi,
  type EmailDesign,
  type EmailTemplate,
  type EmailTemplateField,
  type EmailTemplateValues,
} from "@/app/admin/_lib/api/emailTemplatesApi";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { cn, formatDateTime } from "@/lib/utils";

import { ReadOnlyNotice } from "./SettingsForm";

const QUERY_KEY = ["email-templates"];

const FIELD_LABELS: Record<EmailTemplateField, string> = {
  subject: "Subject",
  heading: "Heading",
  body: "Message",
  button: "Button label",
  note: "Small print",
};
const REQUIRED: EmailTemplateField[] = ["subject", "body", "button"];

export function EmailTemplatesTab({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: emailTemplatesApi.list,
  });

  const selectedKey = searchParams.get("template");
  const select = (key: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (key) sp.set("template", key);
    else sp.delete("template");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  if (error) {
    return (
      <Card>
        <EmptyState
          title="Couldn't load email templates"
          description={apiErrorMessage(error)}
          action={
            <Button variant="secondary" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      </Card>
    );
  }
  if (isLoading || !data) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    );
  }

  const current = data.templates.find((t) => t.key === selectedKey);
  if (current) {
    return (
      <TemplateEditor key={current.key} template={current} canEdit={canEdit} onBack={() => select(null)} />
    );
  }

  return (
    <div className="space-y-5">
      {!canEdit && <ReadOnlyNotice>You can view these emails but not change them.</ReadOnlyNotice>}
      <Card>
        <CardHeader
          icon={Mail}
          title="Email templates"
          description="The words in every email the website sends. Placeholders like {name} are filled in for each person."
        />
        {data.groups.map((group) => {
          const items = data.templates.filter((t) => t.group === group.key);
          if (!items.length) return null;
          return (
            <div key={group.key} className="border-line border-b last:border-b-0">
              <p className="bg-page text-fg-subtle px-4 py-2 text-[11px] font-semibold tracking-wide uppercase sm:px-5">
                {group.label}
              </p>
              <ul className="divide-line divide-y">
                {items.map((item) => (
                  <TemplateRow key={item.key} item={item} canEdit={canEdit} onOpen={() => select(item.key)} />
                ))}
              </ul>
            </div>
          );
        })}
      </Card>
      <DesignCard design={data.design} canEdit={canEdit} />
    </div>
  );
}

function TemplateRow({
  item,
  canEdit,
  onOpen,
}: {
  item: EmailTemplate;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => emailTemplatesApi.update(item.key, { ...item.values, enabled }),
    onSuccess: (_res, enabled) => {
      toast.success(enabled ? `“${item.label}” will be sent.` : `“${item.label}” won't be sent any more.`);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update the email")),
  });

  return (
    <li className="hover:bg-hover flex items-center gap-3 pr-4 transition-colors sm:pr-5">
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-4 text-left focus:outline-none focus-visible:underline sm:pl-5"
      >
        <span className="border-line bg-surface text-fg-subtle group-hover:text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors">
          <Mail className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-fg text-sm font-medium">{item.label}</span>
            {!item.enabled && <Badge tone="warning">Not sent</Badge>}
            {item.customised && item.enabled && <Badge tone="info">Customised</Badge>}
          </span>
          <span className="text-fg-subtle mt-0.5 block truncate text-xs">{item.description}</span>
        </span>
        <ChevronRight className="text-fg-faint h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </button>
      {item.optional && (
        <Switch
          size="sm"
          checked={item.enabled}
          disabled={!canEdit || toggle.isPending}
          onChange={(v) => toggle.mutate(v)}
          aria-label={`Send the “${item.label}” email`}
        />
      )}
    </li>
  );
}

function DesignCard({ design, canEdit }: { design: EmailDesign; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EmailDesign>(design);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(design);
  const validHex = /^#[0-9a-fA-F]{6}$/.test(form.accent);

  const save = useMutation({
    mutationFn: () => emailTemplatesApi.design(form),
    onSuccess: (res) => {
      setErrors({});
      toast.success(res.message ?? "Email look saved");
      if (res.data) setForm(res.data);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(apiErrorMessage(err, "Couldn't save the email look"));
    },
  });

  return (
    <Card>
      <CardHeader
        icon={Palette}
        title="Email look"
        description="Colour, logo and footer used by every email."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput
            label="Accent colour"
            value={form.accent}
            disabled={!canEdit}
            onChange={(accent) => setForm({ ...form, accent })}
            error={errors.accent ?? (!validHex ? "Use a 6-digit colour like #4f46e5." : undefined)}
            hint="Used for the top border, buttons and links."
          />
          <Input
            label="Footer line"
            value={form.footer}
            maxLength={200}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, footer: e.target.value })}
            error={errors.footer}
            hint="Shown in small print under every email, after the website name."
          />
        </div>
        <Switch
          label="Show the logo"
          hint="Uses the light logo from Business profile. Hidden when no logo is set."
          checked={form.show_logo}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, show_logo: v })}
        />
        {canEdit && (
          <div className="flex justify-end gap-2">
            {dirty && (
              <Button variant="secondary" onClick={() => setForm(design)} disabled={save.isPending}>
                Discard
              </Button>
            )}
            <Button
              leftIcon={Save}
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!dirty || !validHex}
            >
              Save look
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TemplateEditor({
  template,
  canEdit,
  onBack,
}: {
  template: EmailTemplate;
  canEdit: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [values, setValues] = useState<EmailTemplateValues>(template.values);
  const [enabled, setEnabled] = useState(template.enabled);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fieldRefs = useRef<
    Partial<Record<EmailTemplateField, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});
  const lastField = useRef<EmailTemplateField>(
    template.fields.includes("body") ? "body" : template.fields[0]!
  );

  const dirty = JSON.stringify(values) !== JSON.stringify(template.values) || enabled !== template.enabled;
  const debounced = useDebouncedValue(values, 450);

  const preview = useQuery({
    queryKey: [...QUERY_KEY, "preview", template.key, debounced],
    queryFn: () => emailTemplatesApi.preview(template.key, debounced),
    placeholderData: keepPreviousData,
  });

  const updated = useMemo(
    () =>
      template.updated_at
        ? `Edited ${formatDateTime(template.updated_at)}${template.updated_by ? ` by ${template.updated_by}` : ""}`
        : null,
    [template.updated_at, template.updated_by]
  );

  const onSaved = (message: string | undefined, fallback: string) => {
    setErrors({});
    toast.success(message ?? fallback);
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: () => emailTemplatesApi.update(template.key, { ...values, enabled }),
    onSuccess: (res) => onSaved(res.message, "Email saved"),
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(apiErrorMessage(err, "Couldn't save the email"));
    },
  });

  const restore = useMutation({
    mutationFn: () => emailTemplatesApi.restore(template.key),
    onSuccess: (res) => {
      setValues(template.defaults);
      setEnabled(true);
      onSaved(res.message, "Original text restored");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't restore the email")),
  });

  const test = useMutation({
    mutationFn: () => emailTemplatesApi.test(template.key, values),
    onSuccess: (res) => toast.success(res.message ?? "Test sent"),
    onError: (err) => {
      setErrors(apiFieldErrors(err));
      toast.error(apiErrorMessage(err, "Couldn't send the test email"));
    },
  });

  const onRestore = async () => {
    const ok = await confirm({
      title: "Restore the original text?",
      message: `Your changes to “${template.label}” will be replaced with the built-in text.`,
      confirmLabel: "Restore",
      variant: "warning",
    });
    if (ok) restore.mutate();
  };

  const insert = (name: string) => {
    const field = lastField.current;
    const el = fieldRefs.current[field];
    const token = `{${name}}`;
    const text = values[field] ?? "";
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setValues({ ...values, [field]: text.slice(0, start) + token + text.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const fieldProps = (field: EmailTemplateField) => ({
    ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      fieldRefs.current[field] = el;
    },
    id: `tpl-${field}`,
    label: FIELD_LABELS[field],
    required: REQUIRED.includes(field),
    value: values[field] ?? "",
    disabled: !canEdit,
    hint: template.hints[field],
    error: errors[field],
    onFocus: () => {
      lastField.current = field;
    },
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues({ ...values, [field]: e.target.value }),
  });

  const unknown = preview.data?.unknown ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" leftIcon={ArrowLeft} onClick={onBack}>
          All emails
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && template.customised && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={RotateCcw}
              onClick={onRestore}
              loading={restore.isPending}
            >
              Restore default
            </Button>
          )}
          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Send}
              onClick={() => test.mutate()}
              loading={test.isPending}
            >
              Send test to me
            </Button>
          )}
        </div>
      </div>

      {!canEdit && <ReadOnlyNotice>You can view these emails but not change them.</ReadOnlyNotice>}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={MailOpen}
            title={template.label}
            description={template.description}
            badge={template.customised ? "Customised" : undefined}
          />
          <CardBody className="space-y-4">
            {template.optional && (
              <Switch
                label="Send this email"
                hint="Turn off to stop sending it. Nothing else changes."
                checked={enabled}
                disabled={!canEdit}
                onChange={setEnabled}
              />
            )}
            {template.fields.map((field) =>
              field === "body" || field === "note" ? (
                <Textarea key={field} rows={field === "body" ? 7 : 3} {...fieldProps(field)} />
              ) : (
                <Input key={field} {...fieldProps(field)} />
              )
            )}

            <div>
              <p className="text-fg-muted text-[13px] font-medium">Placeholders</p>
              <p className="text-fg-subtle mt-0.5 mb-2 text-xs">
                Click to insert into the field you were last typing in. They are filled in for each email.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {template.placeholders.map((p) => (
                  <Button
                    key={p.name}
                    variant="secondary"
                    size="xs"
                    title={p.label}
                    disabled={!canEdit}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(p.name)}
                    className="hover:border-primary hover:text-primary font-mono font-medium"
                  >
                    {`{${p.name}}`}
                  </Button>
                ))}
              </div>
            </div>

            {unknown.length > 0 && (
              <ErrorBanner
                message={`${unknown.map((n) => `{${n}}`).join(", ")} can't be filled in for this email. Use one of the placeholders above.`}
              />
            )}

            {canEdit && (
              <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <span className="text-fg-subtle text-xs">
                  {dirty ? "You have unsaved changes." : updated}
                </span>
                <div className="flex gap-2">
                  {dirty && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setValues(template.values);
                        setEnabled(template.enabled);
                        setErrors({});
                      }}
                    >
                      Discard
                    </Button>
                  )}
                  <Button
                    leftIcon={Save}
                    onClick={() => save.mutate()}
                    loading={save.isPending}
                    disabled={!dirty}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="xl:sticky xl:top-20">
          <CardHeader
            icon={Eye}
            title="Preview"
            description="With example details. Updates as you type."
            actions={
              preview.isFetching ? <span className="text-fg-subtle text-xs">Updating…</span> : undefined
            }
          />
          <div className="border-line bg-page border-b px-4 py-2.5 text-sm sm:px-5">
            <span className="text-fg-subtle">Subject: </span>
            <span className="text-fg font-medium">{preview.data?.subject ?? "…"}</span>
          </div>
          {preview.isError && !preview.data ? (
            <EmptyState title="Couldn't build the preview" description={apiErrorMessage(preview.error)} />
          ) : preview.data ? (
            <iframe
              title={`Preview of ${template.label}`}
              sandbox=""
              srcDoc={preview.data.html}
              className={cn("block h-[640px] w-full rounded-b-xl", preview.isFetching && "opacity-70")}
            />
          ) : (
            <div className="p-5">
              <Skeleton className="h-[600px] w-full" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
