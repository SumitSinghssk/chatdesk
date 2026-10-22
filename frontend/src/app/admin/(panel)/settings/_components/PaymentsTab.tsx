"use client";

import { useState } from "react";
import { Controller, useForm, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  Copy,
  CreditCard,
  ExternalLink,
  Info,
  Plug,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  Wallet,
  Webhook,
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
} from "@/app/admin/_components/ui/index";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import {
  paymentsApi,
  type PaymentConfig,
  type PaymentGatewaySpec,
  type PaymentRecord,
  type PaymentSettings,
} from "@/app/admin/_lib/api/paymentsApi";
import { applyServerErrors } from "@/app/admin/_lib/form";
import { QK } from "@/config/query-keys";
import { formatMoney, openCheckout } from "@/lib/payments/checkout";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { SettingsForm, SettingsSection } from "./SettingsForm";

type Values = {
  currency: string;
  default_gateway: string;
  gateways: Record<string, Record<string, string | boolean>>;
};

const toValues = (cfg: PaymentConfig): Values => ({
  currency: cfg.settings.currency,
  default_gateway: cfg.settings.default_gateway,
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

const toPayload = (values: Values, cfg: PaymentConfig): PaymentSettings => ({
  currency: values.currency,
  default_gateway: values.default_gateway,
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

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
  }
}

function ModeBadge({ keyId }: { keyId: string }) {
  if (!keyId) return <Badge>Not set up</Badge>;
  return keyId.includes("_test_") ? (
    <Badge tone="warning">Test mode</Badge>
  ) : (
    <Badge tone="success">Live</Badge>
  );
}

function WebhookPanel({ gw, hasSecret }: { gw: PaymentGatewaySpec; hasSecret: boolean }) {
  return (
    <div className="border-line bg-page space-y-3 rounded-lg border p-3 text-sm">
      <p className="text-fg flex items-center gap-2 font-medium">
        <Webhook size={15} className="text-fg-subtle" /> Webhook
        {hasSecret ? <Badge tone="success">Secret saved</Badge> : <Badge tone="warning">No secret yet</Badge>}
      </p>
      <div className="flex gap-2">
        <Input readOnly value={gw.webhook_url} aria-label="Webhook URL" className="font-mono text-xs" />
        <Button variant="secondary" leftIcon={Copy} onClick={() => copy(gw.webhook_url)}>
          Copy
        </Button>
      </div>
      <ol className="text-fg-subtle list-decimal space-y-1 pl-5 text-xs">
        <li>
          In {gw.label}, open <b>Accounts &amp; Settings → Webhooks → Add new webhook</b> and paste this URL.
        </li>
        <li>Type any strong secret there, and paste the same secret into Webhook secret above.</li>
        <li>
          Tick these events:{" "}
          {gw.webhook_events.map((e) => (
            <code key={e} className="bg-surface border-line mr-1 rounded border px-1 py-0.5">
              {e}
            </code>
          ))}
        </li>
      </ol>
      <p className="text-fg-subtle flex items-start gap-1.5 text-xs">
        <Info size={13} className="mt-0.5 shrink-0" />
        Webhooks need a public HTTPS address. They won&apos;t reach localhost, so use a tunnel such as ngrok
        to test them while developing.
      </p>
    </div>
  );
}

function GatewayCard({
  gw,
  saved,
  canEdit,
  dirty,
  control,
  register,
  errors,
}: {
  gw: PaymentGatewaySpec;
  saved: Record<string, string | boolean | null>;
  canEdit: boolean;
  dirty: boolean;
  control: Control<Values>;
  register: UseFormRegister<Values>;
  errors: Record<string, string>;
}) {
  const enabled = !!useWatch({ control, name: `gateways.${gw.key}.enabled` });
  const keyId = String(useWatch({ control, name: `gateways.${gw.key}.key_id` }) ?? "");
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const showFields = enabled || open;
  const savedReady = !!saved.key_id && !!saved.has_key_secret;

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await paymentsApi.testConnection(gw.key);
      toast.success(res.message ?? "Connected");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Connection failed"));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={cn("border-line rounded-xl border p-3 sm:p-4", enabled ? "bg-surface" : "bg-page")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <CreditCard size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-fg flex flex-wrap items-center gap-2 font-semibold">
            {gw.label}
            {enabled && <Badge tone="success">On</Badge>}
            <ModeBadge keyId={keyId} />
          </p>
          <a
            href={gw.dashboard_url || gw.website}
            target="_blank"
            rel="noreferrer"
            className="text-fg-subtle hover:text-fg inline-flex items-center gap-1 text-xs"
          >
            Get your API keys
            <ExternalLink size={11} />
          </a>
        </div>
        <div className="flex items-center gap-1">
          {savedReady && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={Plug}
              loading={testing}
              disabled={dirty}
              title={dirty ? "Save your changes first" : undefined}
              onClick={testConnection}
            >
              Test connection
            </Button>
          )}
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
      </div>
      {showFields && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {gw.fields.map((f) => {
              const name = `gateways.${gw.key}.${f.name}` as const;
              const hasSaved = f.secret && !!saved[`has_${f.name}`];
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
          <WebhookPanel gw={gw} hasSecret={!!saved.has_webhook_secret} />
        </div>
      )}
    </div>
  );
}

function PaymentsForm({
  cfg,
  canEdit,
  onTransactions,
  onWebhooks,
}: {
  cfg: PaymentConfig;
  canEdit: boolean;
  onTransactions: () => void;
  onWebhooks: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({ defaultValues: toValues(cfg) });
  const { register, control, handleSubmit, reset, formState, setError } = form;
  const errors = flattenErrors(formState.errors);
  const currencies = [...new Set(cfg.gateways.flatMap((g) => g.currencies))];

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await paymentsApi.update(toPayload(values, cfg));
      queryClient.setQueryData([QK.PAYMENTS], res.data);
      reset(toValues(res.data));
      toast.success(res.message ?? "Payment settings saved");
    } catch (err) {
      applyServerErrors(err, setError, "Couldn't save payment settings");
    }
  });

  return (
    <SettingsForm
      id="settings-payments"
      canEdit={canEdit}
      dirty={formState.isDirty}
      submitting={formState.isSubmitting}
      onSubmit={onSubmit}
      onReset={() => reset(toValues(cfg))}
    >
      <SettingsSection
        title="Gateways"
        description="Connect a payment provider to take payments on the website. Checkout opens in a secure popup, so customers never leave your site."
        icon={Wallet}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={ReceiptText} onClick={onTransactions}>
              Transactions
            </Button>
            <Button size="sm" variant="secondary" leftIcon={Webhook} onClick={onWebhooks}>
              Webhook log
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {cfg.gateways.map((gw) => (
            <GatewayCard
              key={gw.key}
              gw={gw}
              saved={cfg.settings.gateways[gw.key] ?? {}}
              canEdit={canEdit}
              dirty={formState.isDirty}
              control={control}
              register={register}
              errors={errors}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Currency" description="The currency used for payments." icon={CreditCard}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select
                label="Default currency"
                options={currencies.map((c) => ({ value: c, label: c }))}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.currency}
              />
            )}
          />
          {cfg.gateways.length > 1 && (
            <Controller
              control={control}
              name="default_gateway"
              render={({ field }) => (
                <Select
                  label="Default gateway"
                  options={cfg.gateways.map((g) => ({ value: g.key, label: g.label }))}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  hint="Used when more than one gateway is on."
                />
              )}
            />
          )}
        </div>
      </SettingsSection>
    </SettingsForm>
  );
}

function TestPayment({ cfg }: { cfg: PaymentConfig }) {
  const queryClient = useQueryClient();
  const enabled = cfg.gateways.filter((g) => cfg.settings.gateways[g.key]?.enabled);
  const [gateway, setGateway] = useState(enabled[0]?.key ?? "");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; payment?: PaymentRecord } | null>(null);
  const selected = enabled.find((g) => g.key === gateway) ?? enabled[0];
  const live = selected && !cfg.settings.gateways[selected.key]?.test_mode;

  const pay = async () => {
    if (!selected) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Enter an amount of at least 1");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const session = (await paymentsApi.testCheckout({ gateway: selected.key, amount: value })).data;
      const outcome = await openCheckout(session);
      if (outcome.status === "completed") {
        const res = await paymentsApi.confirm(session.gateway, outcome.data);
        setResult({ ok: true, text: res.message ?? "Payment succeeded", payment: res.data });
        toast.success(res.message ?? "Payment succeeded");
      } else if (outcome.status === "failed") {
        await paymentsApi.failed(session.gateway, outcome.orderId, outcome.error).catch(() => null);
        setResult({ ok: false, text: outcome.error });
      } else {
        setResult({ ok: false, text: "Checkout was closed before paying." });
      }
    } catch (err) {
      const text = apiErrorMessage(err, err instanceof Error ? err.message : "Couldn't start the payment");
      setResult({ ok: false, text });
      toast.error(text);
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: [QK.PAYMENTS, "transactions"] });
    }
  };

  return (
    <Section
      title="Test a payment"
      description="Opens the real checkout popup. In test mode use the gateway's test card or UPI, and no money moves."
      icon={CreditCard}
    >
      {!enabled.length ? (
        <p className="text-fg-subtle text-sm">Turn on a gateway and save to test a payment.</p>
      ) : (
        <div className="space-y-3">
          {live && (
            <p className="border-warning/30 bg-warning-soft text-warning rounded-lg border px-3 py-2 text-xs">
              {selected.label} is using live keys. A test payment will charge a real card. Refund it from the{" "}
              {selected.label} dashboard afterwards.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            {enabled.length > 1 && (
              <Select
                aria-label="Gateway"
                options={enabled.map((g) => ({ value: g.key, label: g.label }))}
                value={selected?.key ?? ""}
                onChange={setGateway}
                wrapperClassName="sm:w-48 sm:flex-none"
              />
            )}
            <Input
              aria-label="Amount"
              type="number"
              min={1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              rightAddon={<span className="text-xs">{cfg.settings.currency}</span>}
              wrapperClassName="sm:w-40 sm:flex-none"
            />
            <Button leftIcon={CreditCard} loading={busy} onClick={pay}>
              Pay with {selected?.label}
            </Button>
          </div>
          {result && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                result.ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft"
              )}
            >
              {result.ok ? (
                <CircleCheck size={16} className="text-success mt-0.5 shrink-0" />
              ) : (
                <CircleX size={16} className="text-danger mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-fg font-medium">{result.text}</p>
                {result.payment && (
                  <p className="text-fg-subtle text-xs break-all">
                    {formatMoney(result.payment.amount, result.payment.currency)} ·{" "}
                    {result.payment.gateway_payment_id}
                    {result.payment.method ? ` · ${result.payment.method}` : ""}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

const PAYMENT_TONE = { paid: "success", failed: "danger", refunded: "info", created: "neutral" } as const;
const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "created", label: "Not paid yet" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

function TransactionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const params = { page, per_page: perPage, status: status || undefined, search: search.trim() || undefined };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [QK.PAYMENTS, "transactions", params],
    queryFn: ({ signal }) => paymentsApi.transactions(params, signal),
    placeholderData: (prev) => prev,
    enabled: open,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Transactions"
      description="Every payment started on the site and its latest status from the gateway."
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            leftIcon={Search}
            aria-label="Search transactions"
            placeholder="Search order ID, payment ID or description…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            wrapperClassName="sm:flex-1"
          />
          <Select
            aria-label="Status"
            options={PAYMENT_STATUS_OPTIONS}
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
            icon={ReceiptText}
            title={search || status ? "No transactions match" : "No transactions yet"}
            description="Payments appear here as soon as checkout starts."
          />
        ) : (
          <>
            <ul className="border-line divide-line divide-y rounded-lg border">
              {data.items.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-52">
                    <Badge tone={PAYMENT_TONE[p.status]} dot>
                      {p.status === "created" ? "not paid" : p.status}
                    </Badge>
                    <span className="text-fg font-semibold tabular-nums">
                      {formatMoney(p.amount, p.currency)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg-muted truncate">
                      #{p.id} · {p.description || p.purpose}
                      {p.test_mode && (
                        <Badge tone="warning" className="ml-2">
                          test
                        </Badge>
                      )}
                    </p>
                    <p className="text-fg-subtle truncate font-mono text-xs">
                      {p.gateway_label} · {p.gateway_payment_id || p.gateway_order_id || "—"}
                      {p.method ? ` · ${p.method}` : ""}
                    </p>
                    {p.error && <p className="text-danger text-xs break-words">{p.error}</p>}
                  </div>
                  <span
                    className="text-fg-subtle shrink-0 text-xs whitespace-nowrap"
                    title={formatDateTime(p.created_at)}
                  >
                    {timeAgo(p.created_at)}
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
              unit="transactions"
            />
          </>
        )}
      </div>
    </Modal>
  );
}

const HOOK_TONE = { processed: "success", ignored: "neutral", rejected: "danger", received: "info" } as const;

function WebhooksModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const params = { page, per_page: perPage };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [QK.PAYMENTS, "webhooks", params],
    queryFn: ({ signal }) => paymentsApi.webhooks(params, signal),
    placeholderData: (prev) => prev,
    enabled: open,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Webhook log"
      description="Events the gateway sent to your site. Rejected events usually mean the webhook secret doesn't match."
    >
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="secondary" leftIcon={RefreshCw} loading={isFetching} onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks received yet"
            description="Add the webhook URL in your gateway's dashboard, then events will show here."
          />
        ) : (
          <>
            <ul className="border-line divide-line divide-y rounded-lg border">
              {data.items.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-56">
                    <Badge tone={HOOK_TONE[h.status]} dot>
                      {h.status}
                    </Badge>
                    <code className="text-fg truncate text-xs">{h.event}</code>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg-subtle truncate text-xs">
                      {h.gateway_label}
                      {h.payment_id ? ` · payment #${h.payment_id}` : ""}
                      {h.event_id ? ` · ${h.event_id}` : ""}
                    </p>
                    {h.error && <p className="text-danger text-xs break-words">{h.error}</p>}
                  </div>
                  <span
                    className="text-fg-subtle shrink-0 text-xs whitespace-nowrap"
                    title={formatDateTime(h.created_at)}
                  >
                    {timeAgo(h.created_at)}
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
              unit="events"
            />
          </>
        )}
      </div>
    </Modal>
  );
}

export function PaymentsTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QK.PAYMENTS],
    queryFn: paymentsApi.show,
  });
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !data)
    return (
      <EmptyState
        icon={Wallet}
        title="Couldn't load payment settings"
        description={apiErrorMessage(error)}
        action={
          <Button variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );

  return (
    <div className="space-y-5">
      <PaymentsForm
        key={JSON.stringify(data.settings)}
        cfg={data}
        canEdit={canEdit}
        onTransactions={() => setTransactionsOpen(true)}
        onWebhooks={() => setWebhooksOpen(true)}
      />
      {canEdit && <TestPayment key={JSON.stringify(data.settings.gateways)} cfg={data} />}
      <TransactionsModal open={transactionsOpen} onClose={() => setTransactionsOpen(false)} />
      <WebhooksModal open={webhooksOpen} onClose={() => setWebhooksOpen(false)} />
    </div>
  );
}
