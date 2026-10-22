"use client";

import { useState } from "react";
import { Controller, useForm, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  ExternalLink,
  FileText,
  Globe,
  GripVertical,
  History,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Pagination,
  Section,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { useDragSort } from "@/app/admin/_hooks/useDragSort";
import { apiErrorData, apiErrorMessage } from "@/app/admin/_lib/api/errors";
import {
  smsApi,
  type SmsConfig,
  type SmsGatewaySpec,
  type SmsSettings,
  type SmsTemplateValues,
  type SmsTestResult,
} from "@/app/admin/_lib/api/smsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { QK } from "@/config/query-keys";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { SettingsForm, SettingsSection } from "./SettingsForm";

type Values = {
  default_country_code: string;
  order: string[];
  gateways: Record<string, Record<string, string | boolean>>;
};

const toValues = (cfg: SmsConfig): Values => ({
  default_country_code: cfg.settings.default_country_code,
  order: cfg.settings.order,
  gateways: Object.fromEntries(
    cfg.gateways.map((gw) => {
      const saved = cfg.settings.gateways[gw.key] ?? {};
      return [
        gw.key,
        {
          enabled: !!saved.enabled,
          ...Object.fromEntries(
            gw.fields.map((f) => [f.name, f.secret ? "" : String(saved[f.name] ?? f.default ?? "")])
          ),
        },
      ];
    })
  ),
});

const toPayload = (values: Values, cfg: SmsConfig): Omit<SmsSettings, "templates"> => ({
  default_country_code: values.default_country_code.trim(),
  order: values.order,
  gateways: Object.fromEntries(
    cfg.gateways.map((gw) => {
      const v = values.gateways[gw.key] ?? {};
      return [
        gw.key,
        {
          enabled: !!v.enabled,
          ...Object.fromEntries(
            gw.fields.map((f) => [
              f.name,
              f.secret ? String(v[f.name] ?? "") || null : String(v[f.name] ?? ""),
            ])
          ),
        },
      ];
    })
  ),
});

const toTemplateValues = (cfg: SmsConfig): SmsTemplateValues =>
  Object.fromEntries(
    cfg.templates.map((t) => {
      const saved = cfg.settings.templates[t.key];
      return [
        t.key,
        {
          body: saved?.body ?? t.body,
          template_ids: Object.fromEntries(
            cfg.gateways
              .filter((gw) => gw.template_id_label)
              .map((gw) => [gw.key, saved?.template_ids?.[gw.key] ?? ""])
          ),
        },
      ];
    })
  );

const ordinal = (n: number) => ["1st", "2nd", "3rd"][n] ?? `${n + 1}th`;

function flattenErrors(errors: object, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== "object") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if ("message" in value && typeof value.message === "string") out[path] = value.message;
    else Object.assign(out, flattenErrors(value, path));
  }
  return out;
}

function GatewayCard({
  gw,
  index,
  saved,
  enabled,
  canEdit,
  control,
  register,
  errors,
  drag,
}: {
  gw: SmsGatewaySpec;
  index: number;
  saved: Record<string, string | boolean | null>;
  enabled: boolean;
  canEdit: boolean;
  control: Control<Values>;
  register: UseFormRegister<Values>;
  errors: Record<string, string>;
  drag: ReturnType<typeof useDragSort>;
}) {
  const [open, setOpen] = useState(false);
  const showFields = enabled || open;
  const cardError = errors[`gateways.${gw.key}`];
  const drop = drag.indicator(index);

  return (
    <div
      data-sort-item=""
      {...drag.itemProps(index)}
      className={cn(
        "border-line rounded-xl border p-3 transition sm:p-4",
        enabled ? "bg-surface" : "bg-page",
        drag.isDragging(index) && "opacity-40",
        drop === "before" && "shadow-[0_-2px_0_var(--primary)]",
        drop === "after" && "shadow-[0_2px_0_var(--primary)]"
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {canEdit && (
          <span
            {...drag.handleProps(index)}
            role="button"
            aria-label={`Drag to change ${gw.label}'s priority`}
            title="Drag to change priority"
            className="text-fg-faint hover:text-fg flex shrink-0 cursor-grab items-center active:cursor-grabbing"
          >
            <GripVertical size={18} aria-hidden />
          </span>
        )}
        <span
          className={cn(
            "flex h-7 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold",
            enabled ? "bg-primary/10 text-primary" : "bg-line/60 text-fg-subtle"
          )}
          title="Priority"
        >
          {ordinal(index)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg flex items-center gap-2 font-semibold">
            <span className="truncate">{gw.label}</span>
            {enabled && <Badge tone="success">On</Badge>}
          </p>
          <a
            href={gw.website}
            target="_blank"
            rel="noreferrer"
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-xs"
          >
            {gw.website.replace(/^https?:\/\/(www\.)?/, "")}
            <ExternalLink size={11} />
          </a>
        </div>
        {!enabled && (
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            leftIcon={Settings2}
            aria-label={open ? `Hide ${gw.label} settings` : `Show ${gw.label} settings`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          />
        )}
        <Controller
          control={control}
          name={`gateways.${gw.key}.enabled`}
          render={({ field }) => (
            <Switch
              checked={!!field.value}
              onChange={field.onChange}
              disabled={!canEdit}
              aria-label={`Use ${gw.label}`}
            />
          )}
        />
      </div>
      {cardError && <p className="text-danger mt-2 text-xs">{cardError}</p>}
      {showFields && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {gw.fields.map((f) => {
            const name = `gateways.${gw.key}.${f.name}` as const;
            const hasSaved = f.secret && !!saved[`has_${f.name}`];
            if (f.options.length) {
              return (
                <Controller
                  key={f.name}
                  control={control}
                  name={name}
                  render={({ field }) => (
                    <Select
                      label={f.label}
                      options={f.options}
                      value={String(field.value ?? "")}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      hint={f.help || undefined}
                      error={errors[name]}
                    />
                  )}
                />
              );
            }
            return (
              <Input
                key={f.name}
                label={f.label}
                required={f.required}
                type={f.secret ? "password" : "text"}
                autoComplete={f.secret ? "new-password" : "off"}
                placeholder={hasSaved ? "•••••• (saved)" : f.default || undefined}
                hint={f.secret && hasSaved ? "Leave blank to keep the saved value." : f.help || undefined}
                error={errors[name]}
                {...register(name)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplatesModal({
  cfg,
  open,
  canEdit,
  onClose,
}: {
  cfg: SmsConfig;
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(cfg.templates[0]?.key ?? null);
  const form = useForm<{ templates: SmsTemplateValues }>({
    values: { templates: toTemplateValues(cfg) },
  });
  const { register, handleSubmit, formState, setError, reset } = form;
  const errors = flattenErrors(formState.errors);
  const enabled = new Set(cfg.settings.order.filter((k) => cfg.settings.gateways[k]?.enabled));
  const idGateways = cfg.gateways
    .filter((gw) => gw.template_id_label)
    .sort((a, b) => Number(enabled.has(b.key)) - Number(enabled.has(a.key)));
  const q = query.trim().toLowerCase();
  const visible = cfg.templates.filter(
    (t) => !q || `${t.label} ${t.description} ${t.key}`.toLowerCase().includes(q)
  );

  const close = () => {
    reset();
    setQuery("");
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await smsApi.updateTemplates(values.templates);
      queryClient.setQueryData([QK.SMS], res.data);
      toast.success(res.message ?? "Templates saved");
      onClose();
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save templates");
    }
  });

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Message templates"
      description="The text of each SMS. In India the text must match your DLT-registered template, and each gateway needs its template ID."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button
              type="submit"
              form="sms-templates-form"
              loading={formState.isSubmitting}
              disabled={!formState.isDirty}
            >
              Save templates
            </Button>
          )}
        </>
      }
    >
      <form id="sms-templates-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        {cfg.templates.length > 5 && (
          <Input
            leftIcon={Search}
            aria-label="Search templates"
            placeholder="Search templates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <fieldset disabled={!canEdit} className="space-y-3">
          {visible.map((t) => {
            const isOpen = expanded === t.key || !!q;
            const hasError = Object.keys(errors).some((k) => k.startsWith(`templates.${t.key}.`));
            return (
              <div key={t.key} className="border-line rounded-xl border">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen && !q ? null : t.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-fg flex items-center gap-2 font-semibold">
                      {t.label}
                      {hasError && <Badge tone="danger">Fix errors</Badge>}
                    </span>
                    <span className="text-fg-subtle block text-xs">{t.description}</span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn("text-fg-subtle shrink-0 transition", isOpen && "rotate-180")}
                  />
                </button>
                <div className={cn("border-line space-y-3 border-t px-3 py-3 sm:px-4", !isOpen && "hidden")}>
                  <Textarea
                    label="Message"
                    rows={3}
                    error={errors[`templates.${t.key}.body`]}
                    {...register(`templates.${t.key}.body`, { required: "Enter the message text" })}
                  />
                  <p className="text-fg-subtle flex flex-wrap items-center gap-1.5 text-xs">
                    Variables:
                    {t.variables.map((v) => (
                      <code key={v} className="bg-page border-line rounded border px-1.5 py-0.5">
                        {`{${v}}`}
                      </code>
                    ))}
                  </p>
                  {idGateways.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {idGateways.map((gw) => (
                        <Input
                          key={gw.key}
                          label={`${gw.label} · ${gw.template_id_label}${enabled.has(gw.key) ? "" : " (off)"}`}
                          hint={gw.template_id_help || undefined}
                          {...register(`templates.${t.key}.template_ids.${gw.key}`)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="text-fg-subtle py-6 text-center text-sm">No templates match “{query}”.</p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

const STATUS_TONE = { sent: "success", failed: "danger", skipped: "warning" } as const;
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
];

function LogsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const params = { page, per_page: perPage, status: status || undefined, search: search.trim() || undefined };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [QK.SMS, "logs", params],
    queryFn: ({ signal }) => smsApi.logs(params, signal),
    placeholderData: (prev) => prev,
    enabled: open,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="SMS delivery log"
      description="Every SMS the site sent, which gateway delivered it, and why any gateway failed. Kept for 90 days."
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            leftIcon={Search}
            aria-label="Search log"
            placeholder="Search number, message or error…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            wrapperClassName="sm:flex-1"
          />
          <Select
            aria-label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            wrapperClassName="sm:w-44 sm:flex-none"
          />
          <Button variant="secondary" leftIcon={RefreshCw} loading={isFetching} onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={MessageSquareText}
            title={search || status ? "No messages match" : "No SMS sent yet"}
            description={
              search || status ? "Try a different search or status." : "Messages appear here once sent."
            }
          />
        ) : (
          <>
            <ul className="border-line divide-line divide-y rounded-lg border">
              {data.items.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:gap-3"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-48">
                    <Badge tone={STATUS_TONE[log.status]} dot>
                      {log.status}
                    </Badge>
                    <span className="text-fg font-medium tabular-nums">{log.phone}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg-muted line-clamp-2 break-words">{log.message || "—"}</p>
                    <p className="text-fg-subtle text-xs">
                      {log.template ?? "Custom message"}
                      {log.gateway_label ? ` · via ${log.gateway_label}` : ""}
                      {log.attempts.length > 1 ? ` · ${log.attempts.length} gateways tried` : ""}
                    </p>
                    {log.error && <p className="text-danger mt-0.5 text-xs break-words">{log.error}</p>}
                  </div>
                  <span
                    className="text-fg-subtle shrink-0 text-xs whitespace-nowrap"
                    title={formatDateTime(log.created_at)}
                  >
                    {timeAgo(log.created_at)}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination
              meta={data.meta}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n);
                setPage(1);
              }}
              unit="messages"
            />
          </>
        )}
      </div>
    </Modal>
  );
}

function SmsTest({ cfg }: { cfg: SmsConfig }) {
  const [phone, setPhone] = useState("");
  const [gateway, setGateway] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SmsTestResult | null>(null);
  const queryClient = useQueryClient();
  const labels = Object.fromEntries(cfg.gateways.map((g) => [g.key, g.label]));
  const enabled = cfg.settings.order.filter((k) => cfg.settings.gateways[k]?.enabled);

  const send = async () => {
    if (phone.trim().length < 6) return;
    setSending(true);
    setResult(null);
    try {
      const res = await smsApi.test(phone.trim(), gateway || undefined);
      setResult(res.data);
      toast.success(res.message ?? "Test SMS sent");
    } catch (err) {
      const data = (apiErrorData(err) as { data?: SmsTestResult }).data;
      if (data) setResult(data);
      toast.error(apiErrorMessage(err, "Couldn't send the test SMS"));
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: [QK.SMS, "logs"] });
    }
  };

  return (
    <Section
      title="Send a test SMS"
      description="Sends the login code template with code 123456. Pick one gateway, or test the full chain in priority order."
      icon={Send}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <Input
          aria-label="Mobile number"
          type="tel"
          inputMode="tel"
          placeholder="Mobile number, e.g. 98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          wrapperClassName="lg:w-72 lg:flex-none"
        />
        <Select
          aria-label="Gateway"
          value={gateway}
          onChange={setGateway}
          options={[
            { value: "", label: "All gateways, in priority order" },
            ...cfg.gateways.map((g) => ({
              value: g.key,
              label: `${g.label}${enabled.includes(g.key) ? "" : " (off)"}`,
            })),
          ]}
          wrapperClassName="lg:w-72 lg:flex-none"
        />
        <Button
          variant="secondary"
          leftIcon={Send}
          loading={sending}
          disabled={phone.trim().length < 6}
          onClick={send}
          className="lg:ml-auto"
        >
          Send test
        </Button>
      </div>
      {result && (
        <ul className="border-line divide-line divide-y rounded-lg border text-sm">
          {result.attempts.length === 0 && (
            <li className="text-fg-subtle px-3 py-2">{result.error ?? "No gateway was tried."}</li>
          )}
          {result.attempts.map((a, i) => (
            <li key={`${a.gateway}-${i}`} className="flex items-start gap-2 px-3 py-2">
              {a.ok ? (
                <CircleCheck size={16} className="text-success mt-0.5 shrink-0" />
              ) : (
                <CircleX size={16} className="text-danger mt-0.5 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="text-fg font-medium">{labels[a.gateway] ?? a.gateway}</span>
                <span className="text-fg-subtle block text-xs break-words">
                  {a.ok ? "Sent" : (a.error ?? "Failed")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SmsForm({
  cfg,
  canEdit,
  onTemplates,
  onLogs,
}: {
  cfg: SmsConfig;
  canEdit: boolean;
  onTemplates: () => void;
  onLogs: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({ defaultValues: toValues(cfg) });
  const { register, control, handleSubmit, reset, formState, setError, setValue, getValues } = form;
  const order = useWatch({ control, name: "order" });
  const gateways = useWatch({ control, name: "gateways" });
  const specs = Object.fromEntries(cfg.gateways.map((g) => [g.key, g]));
  const errors = flattenErrors(formState.errors);
  const enabledKeys = order.filter((k) => gateways?.[k]?.enabled);
  const drag = useDragSort({
    disabled: !canEdit,
    onMove: (from, to) => {
      const next = [...getValues("order")];
      next.splice(to, 0, ...next.splice(from, 1));
      setValue("order", next, { shouldDirty: true });
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await smsApi.update(toPayload(values, cfg));
      queryClient.setQueryData([QK.SMS], res.data);
      reset(toValues(res.data));
      toast.success(res.message ?? "SMS settings saved");
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save SMS settings");
    }
  });

  return (
    <SettingsForm
      id="settings-sms"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(toValues(cfg))}
    >
      <SettingsSection
        title="Gateways"
        description="Turn on one or more providers and drag them into order. Messages go through the 1st enabled gateway; if it fails, the next one is tried automatically."
        icon={MessageSquareText}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={FileText} onClick={onTemplates}>
              Message templates
              <Badge>{cfg.templates.length}</Badge>
            </Button>
            <Button size="sm" variant="secondary" leftIcon={History} onClick={onLogs}>
              Delivery log
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {order.map((key, index) => {
            const gw = specs[key];
            if (!gw) return null;
            return (
              <GatewayCard
                key={key}
                gw={gw}
                index={index}
                saved={cfg.settings.gateways[key] ?? {}}
                enabled={!!gateways?.[key]?.enabled}
                canEdit={canEdit}
                control={control}
                register={register}
                errors={errors}
                drag={drag}
              />
            );
          })}
        </div>
        {enabledKeys.length > 0 && (
          <p className="text-fg-subtle text-xs">
            Sending order: {enabledKeys.map((k) => specs[k]?.label).join(" → ")}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Mobile numbers"
        description="Numbers typed without a + country code get this code added."
        icon={Globe}
      >
        <Input
          label="Default country code"
          inputMode="numeric"
          wrapperClassName="sm:max-w-xs"
          hint="Digits only, e.g. 91 for India, 1 for the US."
          error={errors.default_country_code}
          {...register("default_country_code", {
            pattern: { value: /^\d{1,4}$/, message: "Use 1–4 digits" },
          })}
        />
      </SettingsSection>
    </SettingsForm>
  );
}

export function SmsTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [QK.SMS], queryFn: smsApi.show });
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !data)
    return (
      <EmptyState
        icon={MessageSquareText}
        title="Couldn't load SMS settings"
        description={apiErrorMessage(error)}
        action={
          <Button variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );

  const formKey = JSON.stringify([
    data.settings.default_country_code,
    data.settings.order,
    data.settings.gateways,
  ]);

  return (
    <div className="space-y-5">
      <SmsForm
        key={formKey}
        cfg={data}
        canEdit={canEdit}
        onTemplates={() => setTemplatesOpen(true)}
        onLogs={() => setLogsOpen(true)}
      />
      {canEdit && <SmsTest cfg={data} />}
      <TemplatesModal
        cfg={data}
        open={templatesOpen}
        canEdit={canEdit}
        onClose={() => setTemplatesOpen(false)}
      />
      <LogsModal open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
}
