"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Copy, CreditCard, KeyRound, Settings2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Input, Modal, Select, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, timeAgo } from "@/lib/utils";

import {
  ORDERS_QK,
  PAYMENTS_QK,
  paymentsApi,
  type GatewayName,
  type GatewayProvider,
  type PaymentOptions,
  type PaymentTemplateKey,
} from "../../../_lib/commerceApi";
import { INBOX_QK, inboxApi } from "../../../_lib/inboxApi";
import { Block } from "../CheckoutSettings";

const ABOUT: Record<GatewayName, { blurb: string; tile: string; steps: string[] }> = {
  razorpay: {
    blurb: "UPI, cards, net banking and wallets. The most used in India.",
    tile: "bg-[#0c2451] text-white",
    steps: [
      "In the Razorpay Dashboard, open Account & Settings → API Keys and generate a key (test or live).",
      "Paste the Key ID and Key secret here and save.",
      "Then open Webhooks, add the URL shown here, make up a secret, tick the events listed, and paste the same secret here.",
    ],
  },
  cashfree: {
    blurb: "UPI, cards and net banking, with quick settlements.",
    tile: "bg-[#6933d3] text-white",
    steps: [
      "In the Cashfree Merchant Dashboard, open Developers → API Keys (Payment Gateway) and copy the App ID and Secret key.",
      "Choose test or live to match the keys, and save.",
      "Payment links report back on their own. For refund updates, add the URL shown here under Developers → Webhooks.",
    ],
  },
  payu: {
    blurb: "UPI, cards, net banking and EMI.",
    tile: "bg-[#a6c307] text-[#1b2400]",
    steps: [
      "In the PayU Dashboard, open Developers → Key and Salt and copy both.",
      "Choose test or live to match them, and save.",
      "Add the URL shown here as the webhook for successful and failed payments.",
    ],
  },
  stripe: {
    blurb: "Cards and wallets worldwide, in most currencies.",
    tile: "bg-[#635bff] text-white",
    steps: [
      "In the Stripe Dashboard, open Developers → API keys and copy the Secret key (a restricted key with Checkout Sessions and Refunds also works).",
      "Paste it here and save. Stripe links work for up to 24 hours.",
      "Then open Developers → Webhooks, add the URL shown here with the events listed, and paste its signing secret (whsec_…) here.",
    ],
  },
  whatsapp_pay: {
    blurb: "Customers pay with UPI without leaving the chat. India only.",
    tile: "bg-[#25d366] text-white",
    steps: [
      "In WhatsApp Manager, open Payment configurations and create one linked to your Razorpay, PayU, BillDesk or Zaakpay account.",
      "Enter the configuration's name here, and the gateway behind it.",
      "Customers with Indian numbers get WhatsApp's own Review and pay inside the 24-hour window. Others get your payment link.",
    ],
  },
};

const EXPIRY = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "360", label: "6 hours" },
  { value: "1440", label: "24 hours" },
  { value: "4320", label: "3 days" },
  { value: "10080", label: "7 days" },
];
const REMINDERS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 180, label: "3 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
];
const TEMPLATES: { key: PaymentTemplateKey; label: string; hint: string }[] = [
  { key: "payment_link", label: "Payment link", hint: "{{3}} is the link" },
  { key: "payment_reminder", label: "Reminder", hint: "Falls back to the payment link template" },
  {
    key: "cod_confirm",
    label: "Confirm cash on delivery",
    hint: "Add quick replies like Confirm and Cancel",
  },
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy. Select it and copy it yourself.");
  }
}

function Tile({ provider, className }: { provider: GatewayProvider; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
        ABOUT[provider.provider].tile,
        className
      )}
      aria-hidden
    >
      {provider.provider === "whatsapp_pay" ? <Wallet className="h-5 w-5" /> : provider.label.slice(0, 2)}
    </span>
  );
}

function GatewayModal({
  provider,
  others,
  onClose,
}: {
  provider: GatewayProvider;
  /** other link gateways that are connected (to offer "use this one for links") */
  others: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const gw = provider.gateway;
  const isWa = provider.provider === "whatsapp_pay";
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"test" | "live">(gw?.mode ?? "test");
  const [secret, setSecret] = useState("");
  const [config, setConfig] = useState(gw?.configuration_name ?? "");
  const [waGateway, setWaGateway] = useState(gw?.wa_gateway ?? "razorpay");
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const about = ABOUT[provider.provider];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: PAYMENTS_QK.ALL });
    await queryClient.invalidateQueries({ queryKey: ORDERS_QK.CHECKOUT });
  };
  const save = async () => {
    setBusy("save");
    setProblem("");
    try {
      const res = await paymentsApi.saveGateway(provider.provider, {
        credentials: creds,
        mode: provider.needs_mode ? mode : null,
        webhook_secret: secret.trim() || null,
        configuration_name: isWa ? config.trim() || null : null,
        wa_gateway: isWa ? waGateway : null,
        make_default: makeDefault,
      });
      toast.success(res.message ?? "Saved");
      setCreds({});
      setSecret("");
      await refresh();
      // a first connection stays open: the webhook URL to add at the gateway is shown now
      if (gw || isWa) onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) {
        setErrors(err.errors);
        setProblem(err.message);
      } else setProblem(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const run = async (key: string, fn: () => Promise<{ message?: string }>, close = false) => {
    setBusy(key);
    setProblem("");
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      await refresh();
      if (close) onClose();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={gw ? provider.label : `Connect ${provider.label}`}
      description={about.blurb}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {gw && (
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft mr-auto"
              loading={busy === "remove"}
              onClick={() => {
                if (
                  window.confirm(
                    `Disconnect ${provider.label}? Refunds for earlier payments will have to be made from the ${provider.label} dashboard.`
                  )
                )
                  void run("remove", () => paymentsApi.removeGateway(provider.provider), true);
              }}
            >
              Disconnect
            </Button>
          )}
          {gw && !isWa && (
            <Button
              variant="secondary"
              loading={busy === "check"}
              onClick={() => run("check", () => paymentsApi.checkGateway(provider.provider))}
            >
              Check connection
            </Button>
          )}
          <Button loading={busy === "save"} onClick={save} leftIcon={gw ? undefined : KeyRound}>
            {gw ? "Save" : isWa ? "Turn on" : "Connect"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {problem && (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger rounded-lg border px-3 py-2 text-sm"
          >
            {problem}
          </p>
        )}
        {gw && (
          <div className="border-line bg-page/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <Badge tone="success" dot>
              Connected
            </Badge>
            {!isWa && (
              <Badge tone={gw.mode === "live" ? "brand" : "warning"}>
                {gw.mode === "live" ? "Live" : "Test"}
              </Badge>
            )}
            {gw.is_default && <Badge tone="info">Used for payment links</Badge>}
            <span className="text-fg-subtle min-w-0 truncate font-mono text-xs">{gw.hint}</span>
            {gw.last_event_at && (
              <span className="text-fg-faint text-xs">· last heard from {timeAgo(gw.last_event_at)}</span>
            )}
          </div>
        )}
        {gw?.last_error && (
          <p className="text-danger text-xs break-words" role="status">
            {gw.last_error}
          </p>
        )}

        <ol className="text-fg-subtle list-decimal space-y-1.5 pl-5 text-sm">
          {about.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        {isWa ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Payment configuration name"
              name="configuration_name"
              maxLength={100}
              placeholder="e.g. my-shop-upi"
              value={config}
              error={errors.configuration_name}
              onChange={(e) => setConfig(e.target.value)}
            />
            <Select
              id="wa_gateway"
              label="Gateway behind it"
              value={waGateway}
              options={[
                { value: "razorpay", label: "Razorpay" },
                { value: "payu", label: "PayU" },
                { value: "billdesk", label: "BillDesk" },
                { value: "zaakpay", label: "Zaakpay" },
              ]}
              onChange={setWaGateway}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {provider.fields.map((f) => {
              const saved = gw?.saved_fields.includes(f.key);
              return (
                <Input
                  key={f.key}
                  label={f.label}
                  name={`credentials.${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    saved ? (f.secret ? "Saved · leave empty to keep" : "Saved · leave empty to keep") : ""
                  }
                  value={creds[f.key] ?? ""}
                  error={errors[`credentials.${f.key}`]}
                  onChange={(e) => {
                    setCreds((c) => ({ ...c, [f.key]: e.target.value }));
                    setErrors({});
                  }}
                  wrapperClassName={provider.fields.length === 1 ? "sm:col-span-2" : undefined}
                />
              );
            })}
            {provider.needs_mode && (
              <Select
                id="gateway_mode"
                label="Keys are for"
                value={mode}
                options={[
                  { value: "test", label: "Test mode (no real money)" },
                  { value: "live", label: "Live payments" },
                ]}
                onChange={(v) => setMode(v as "test" | "live")}
              />
            )}
            {provider.webhook_secret && (
              <Input
                label={provider.provider === "stripe" ? "Webhook signing secret" : "Webhook secret"}
                name="webhook_secret"
                type="password"
                autoComplete="off"
                placeholder={
                  gw?.has_webhook_secret
                    ? "Saved · leave empty to keep"
                    : provider.provider === "stripe"
                      ? "whsec_…"
                      : ""
                }
                value={secret}
                hint={
                  gw?.has_webhook_secret
                    ? undefined
                    : "Without it, payments are checked every 15 minutes instead of instantly."
                }
                onChange={(e) => setSecret(e.target.value)}
                wrapperClassName="sm:col-span-2"
              />
            )}
          </div>
        )}

        {gw?.webhook_url && (
          <div className="space-y-2">
            <p className="text-fg text-sm font-medium">Webhook URL</p>
            <div className="border-line bg-page/60 flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3">
              <code className="text-fg min-w-0 flex-1 truncate text-xs" title={gw.webhook_url}>
                {gw.webhook_url}
              </code>
              <Button size="sm" variant="secondary" leftIcon={Copy} onClick={() => copy(gw.webhook_url!)}>
                Copy
              </Button>
            </div>
            {provider.webhook_events.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Webhook events">
                {provider.webhook_events.map((e) => (
                  <span
                    key={e}
                    className="border-line text-fg-subtle rounded-md border px-2 py-0.5 font-mono text-[11px]"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!isWa && others > 0 && !gw?.is_default && (
          <Switch
            label="Use this gateway for payment links"
            hint="Only one gateway makes the links. You can switch any time."
            checked={makeDefault}
            onChange={setMakeDefault}
          />
        )}
        <p className="text-fg-faint flex items-start gap-1.5 text-xs">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Keys are stored encrypted and never shown again. Money goes straight to your own account.
        </p>
      </div>
    </Modal>
  );
}

function OptionsForm({ options, ready }: { options: PaymentOptions; ready: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ...options,
    prepaid_value: options.prepaid_kind ? String(options.prepaid_value) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: templates } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    staleTime: 60_000,
  });
  const approved = (templates ?? []).filter((t) => t.category !== "authentication");
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };
  const toggleReminder = (m: number) => {
    const has = form.reminders.includes(m);
    if (!has && form.reminders.length >= 3) return toast.error("Up to 3 reminders");
    set({
      reminders: has ? form.reminders.filter((r) => r !== m) : [...form.reminders, m].sort((a, b) => a - b),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await paymentsApi.saveOptions({
        online_enabled: form.online_enabled,
        link_expiry_minutes: form.link_expiry_minutes,
        reminders: form.reminders,
        cancel_unpaid: form.cancel_unpaid,
        prepaid_kind: form.prepaid_kind,
        prepaid_value: form.prepaid_kind ? Number(form.prepaid_value || 0) : 0,
        cod_confirm: form.cod_confirm,
        cod_to_prepaid: form.cod_to_prepaid,
        templates: form.templates,
      });
      toast.success(res.message ?? "Saved");
      await queryClient.invalidateQueries({ queryKey: PAYMENTS_QK.ALL });
      await queryClient.invalidateQueries({ queryKey: ORDERS_QK.CHECKOUT });
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Block
        title="Online payment"
        description="How payment links work for your customers."
        icon={CreditCard}
      >
        <Switch
          label="Offer “Pay online” at checkout"
          hint={ready ? "Next to cash on delivery in the order summary." : "Connect a gateway above first."}
          checked={form.online_enabled}
          onChange={(online_enabled) => set({ online_enabled })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="link_expiry"
            label="A link works for"
            value={String(form.link_expiry_minutes)}
            options={EXPIRY}
            hint="Stripe links last at most 24 hours."
            onChange={(v) => set({ link_expiry_minutes: Number(v) })}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <Select
              id="prepaid_kind"
              label="Online discount"
              value={form.prepaid_kind ?? ""}
              options={[
                { value: "", label: "No discount" },
                { value: "percent", label: "Percent off" },
                { value: "fixed", label: `Amount off (${options.currency})` },
              ]}
              onChange={(v) => set({ prepaid_kind: (v || null) as PaymentOptions["prepaid_kind"] })}
            />
            <Input
              label={form.prepaid_kind === "percent" ? "%" : options.currency}
              name="prepaid_value"
              inputMode="decimal"
              disabled={!form.prepaid_kind}
              value={form.prepaid_value}
              error={errors.prepaid_value}
              onChange={(e) => set({ prepaid_value: e.target.value })}
            />
          </div>
        </div>
        {errors[""] && <p className="text-danger text-xs">{errors[""]}</p>}
        <div>
          <p className="text-fg mb-1 text-sm font-medium">Remind unpaid customers after</p>
          <p className="text-fg-subtle mb-2 text-xs">Up to 3 reminders, while the link still works.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reminders">
            {REMINDERS.map((r) => {
              const on = form.reminders.includes(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleReminder(r.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition",
                    on
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line text-fg-subtle hover:border-line-strong hover:text-fg"
                  )}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        <Switch
          label="Cancel the order when its link expires"
          hint="Otherwise the customer is offered a new link (or cash on delivery)."
          checked={form.cancel_unpaid}
          onChange={(cancel_unpaid) => set({ cancel_unpaid })}
        />
      </Block>

      <Block
        title="Cash on delivery"
        description="Fewer fake orders and returns: confirm first, or nudge to pay now."
        icon={BellRing}
      >
        <Switch
          label="Ask cash-on-delivery buyers to confirm"
          hint="For orders your team makes: the customer taps Confirm or Cancel on WhatsApp."
          checked={form.cod_confirm}
          onChange={(cod_confirm) => set({ cod_confirm })}
        />
        <Switch
          label="Offer to pay now instead"
          hint="After a cash-on-delivery order, with your discount for paying online."
          checked={form.cod_to_prepaid}
          onChange={(cod_to_prepaid) => set({ cod_to_prepaid })}
        />
      </Block>

      <Block
        title="When the chat is closed"
        description="Outside the 24-hour window WhatsApp only allows templates."
        icon={Settings2}
        className="xl:col-span-2"
      >
        <ul className="divide-line border-line divide-y rounded-lg border">
          {TEMPLATES.map((t) => (
            <li
              key={t.key}
              className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-center"
            >
              <div>
                <p className="text-fg text-sm font-medium">{t.label}</p>
                <p className="text-fg-subtle text-xs">{t.hint}</p>
              </div>
              <Select
                aria-label={`Template for ${t.label}`}
                size="sm"
                value={form.templates[t.key] ?? ""}
                options={[
                  { value: "", label: "Don't send" },
                  ...approved.map((a) => ({ value: a.id, label: a.name })),
                ]}
                onChange={(v) => set({ templates: { ...form.templates, [t.key]: v ? Number(v) : null } })}
              />
            </li>
          ))}
        </ul>
        <p className="text-fg-faint text-xs">
          Templates get the customer&apos;s first name, the order number and the payment link as{" "}
          {"{{1}}, {{2}}, {{3}}"}. A link button with a variable gets the payment&apos;s reference: point it
          at your <code className="font-mono">…/website/shop/pay/go/{"{{1}}"}</code> address.
        </p>
      </Block>

      <div className="flex justify-end xl:col-span-2">
        <Button loading={saving} onClick={save}>
          Save payment settings
        </Button>
      </div>
    </>
  );
}

/** Connecting gateways (Razorpay, Cashfree, PayU, Stripe, WhatsApp Pay) and the payment options. */
export function PaymentSetup() {
  const [open, setOpen] = useState<GatewayName | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: PAYMENTS_QK.SETUP,
    queryFn: async () => (await paymentsApi.setup()).data,
  });
  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 sm:p-5">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  const linkGateways = data.providers.filter((p) => p.provider !== "whatsapp_pay" && p.gateway);
  const current = data.providers.find((p) => p.provider === open) ?? null;

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {!data.ready && (
        <div className="border-primary/25 bg-primary-soft/60 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          <CreditCard className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-fg min-w-0 flex-1">
            <span className="font-semibold">Get paid inside WhatsApp.</span>{" "}
            <span className="text-fg-subtle">
              Connect your own payment gateway: customers get a secure Pay button at checkout, orders confirm
              themselves when paid, and the money goes straight to your account.
            </span>
          </p>
        </div>
      )}

      <section aria-label="Payment gateways">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.providers.map((p) => {
            const gw = p.gateway;
            return (
              <li key={p.provider}>
                <button
                  type="button"
                  onClick={() => setOpen(p.provider)}
                  aria-label={`${gw ? "Manage" : "Connect"} ${p.label}`}
                  className={cn(
                    "border-line hover:border-line-strong hover:bg-hover flex h-full w-full items-start gap-3 rounded-xl border p-4 text-left transition",
                    gw?.is_default && "border-primary/40 bg-primary-soft/30"
                  )}
                >
                  <Tile provider={p} />
                  <span className="min-w-0 flex-1">
                    <span className="text-fg flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      {p.label}
                      {gw ? (
                        <>
                          <Badge tone={gw.last_error ? "danger" : "success"} dot>
                            {gw.last_error ? "Needs attention" : "Connected"}
                          </Badge>
                          {p.provider !== "whatsapp_pay" && gw.mode === "test" && (
                            <Badge tone="warning">Test</Badge>
                          )}
                          {gw.is_default && linkGateways.length > 1 && <Badge tone="info">Links</Badge>}
                        </>
                      ) : null}
                    </span>
                    <span className="text-fg-subtle mt-0.5 block text-xs">{ABOUT[p.provider].blurb}</span>
                    <span className="text-primary mt-2 block text-xs font-medium">
                      {gw ? "Manage" : "Connect"} →
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <OptionsForm key={JSON.stringify(data.options)} options={data.options} ready={data.ready} />
      </div>

      {current && (
        <GatewayModal
          provider={current}
          others={linkGateways.filter((g) => g.provider !== current.provider).length}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
