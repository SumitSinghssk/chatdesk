"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Select, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { ORDERS_QK, ordersApi, type CheckoutSettings, type NotifyStep } from "../../_lib/commerceApi";
import { INBOX_QK, inboxApi } from "../../_lib/inboxApi";

const STEPS: { key: NotifyStep; label: string; hint: string }[] = [
  { key: "confirmed", label: "Order confirmed", hint: "Items, total, payment and address" },
  { key: "packed", label: "Packed", hint: "It will ship soon" },
  { key: "shipped", label: "Shipped", hint: "Courier and tracking link" },
  { key: "delivered", label: "Delivered", hint: "Thank you, and asks how it was" },
  { key: "cancelled", label: "Cancelled", hint: "With the reason, if you give one" },
  { key: "paid", label: "Payment received", hint: "When a confirmed order is paid online later" },
  { key: "refunded", label: "Refunded", hint: "How much, and when it reaches their bank" },
];

const text = (v: number | null) => (v === null || v === undefined ? "" : String(v));

export function Block({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: typeof ShoppingCart;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-line rounded-xl border", className)}>
      <header className="border-line flex items-start gap-3 border-b px-4 py-3.5">
        <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-fg text-sm font-semibold">{title}</h2>
          <p className="text-fg-subtle text-xs">{description}</p>
        </div>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Form({ settings }: { settings: CheckoutSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    order_prefix: settings.order_prefix,
    shipping_fee: text(settings.shipping_fee),
    free_shipping_above: text(settings.free_shipping_above),
    tax_percent: text(settings.tax_percent),
    tax_inclusive: settings.tax_inclusive,
    cod_enabled: settings.cod_enabled,
    cod_fee: text(settings.cod_fee),
    min_order: text(settings.min_order),
    ask_address: settings.ask_address,
    notifications: settings.notifications,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: templates } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    staleTime: 60_000,
  });
  const approved = (templates ?? []).filter((t) => t.category !== "authentication");
  const c = settings.currency;
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };
  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = async () => {
    setSaving(true);
    try {
      const res = await ordersApi.saveCheckout({
        order_prefix: form.order_prefix.trim() || "#",
        shipping_fee: n(form.shipping_fee) ?? 0,
        free_shipping_above: n(form.free_shipping_above),
        tax_percent: n(form.tax_percent) ?? 0,
        tax_inclusive: form.tax_inclusive,
        cod_enabled: form.cod_enabled,
        cod_fee: n(form.cod_fee) ?? 0,
        min_order: n(form.min_order),
        ask_address: form.ask_address,
        notifications: form.notifications,
      });
      toast.success(res.message ?? "Saved");
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
        title="Checkout"
        description="Delivery charges, tax and cash on delivery for orders on WhatsApp."
        icon={ShoppingCart}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={`Delivery charge (${c})`}
            name="shipping_fee"
            inputMode="decimal"
            placeholder="0 for free delivery"
            value={form.shipping_fee}
            error={errors.shipping_fee}
            onChange={(e) => set({ shipping_fee: e.target.value })}
          />
          <Input
            label={`Free delivery above (${c})`}
            name="free_shipping_above"
            inputMode="decimal"
            placeholder="Optional"
            value={form.free_shipping_above}
            onChange={(e) => set({ free_shipping_above: e.target.value })}
          />
          <Input
            label="Tax (%)"
            name="tax_percent"
            inputMode="decimal"
            placeholder="e.g. 18"
            value={form.tax_percent}
            error={errors.tax_percent}
            onChange={(e) => set({ tax_percent: e.target.value })}
          />
          <div className="sm:pt-7">
            <Switch
              label="Prices include tax"
              hint="Off: tax is added on top of the price."
              checked={form.tax_inclusive}
              onChange={(tax_inclusive) => set({ tax_inclusive })}
            />
          </div>
          <Input
            label={`Minimum order (${c})`}
            name="min_order"
            inputMode="decimal"
            placeholder="None"
            value={form.min_order}
            onChange={(e) => set({ min_order: e.target.value })}
          />
          <Input
            label="Order number prefix"
            name="order_prefix"
            maxLength={10}
            value={form.order_prefix}
            error={errors.order_prefix}
            hint={`The next order is ${form.order_prefix || "#"}${settings.next_number}.`}
            onChange={(e) => set({ order_prefix: e.target.value })}
          />
        </div>
        <div className="divide-line border-line divide-y rounded-lg border">
          <div className="flex flex-wrap items-start gap-4 p-3">
            <div className="min-w-0 flex-1">
              <Switch
                label="Cash on delivery"
                hint="Customers can choose to pay when the order arrives."
                checked={form.cod_enabled}
                onChange={(cod_enabled) => set({ cod_enabled })}
              />
            </div>
            {form.cod_enabled && (
              <Input
                aria-label={`Cash on delivery fee (${c})`}
                name="cod_fee"
                inputMode="decimal"
                placeholder={`Fee (${c})`}
                value={form.cod_fee}
                onChange={(e) => set({ cod_fee: e.target.value })}
                wrapperClassName="w-32"
              />
            )}
          </div>
          <div className="p-3">
            <Switch
              label="Ask for the delivery address"
              hint="Uses WhatsApp's address form for Indian numbers, and offers the last address used."
              checked={form.ask_address}
              onChange={(ask_address) => set({ ask_address })}
            />
          </div>
        </div>
      </Block>

      <Block
        title="Order updates on WhatsApp"
        description="What the customer hears at each step. Outside the 24-hour window, a template you pick is sent."
        icon={MessageCircle}
      >
        <ul className="divide-line border-line divide-y rounded-lg border">
          {STEPS.map((s) => {
            const rule = form.notifications[s.key];
            return (
              <li
                key={s.key}
                className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-center"
              >
                <Switch
                  label={s.label}
                  hint={s.hint}
                  checked={rule.on}
                  onChange={(on) =>
                    set({ notifications: { ...form.notifications, [s.key]: { ...rule, on } } })
                  }
                />
                <Select
                  aria-label={`Template for ${s.label} when the chat is closed`}
                  size="sm"
                  value={rule.template_id ?? ""}
                  disabled={!rule.on}
                  options={[
                    { value: "", label: "If chat closed: don't send" },
                    ...approved.map((t) => ({ value: t.id, label: `If chat closed: ${t.name}` })),
                  ]}
                  onChange={(v) =>
                    set({
                      notifications: {
                        ...form.notifications,
                        [s.key]: { ...rule, template_id: v ? Number(v) : null },
                      },
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
        <p className="text-fg-faint text-xs">
          Templates get the customer&apos;s first name, the order number and the tracking link or total as
          {" {{1}}, {{2}}, {{3}}"}.
        </p>
      </Block>

      <div className="flex justify-end xl:col-span-2">
        <Button loading={saving} onClick={save}>
          Save checkout settings
        </Button>
      </div>
    </>
  );
}

export function CheckoutSettingsBlocks() {
  const { data } = useQuery({
    queryKey: ORDERS_QK.CHECKOUT,
    queryFn: async () => (await ordersApi.checkout()).data,
  });
  if (!data) return <Skeleton className="h-64 rounded-xl xl:col-span-2" />;
  return <Form key={JSON.stringify(data)} settings={data} />;
}
