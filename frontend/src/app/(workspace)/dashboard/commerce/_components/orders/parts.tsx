"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, PackagePlus, Plus, Search, Trash2 } from "lucide-react";

import { Button, Input } from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

import {
  COMMERCE_QK,
  commerceApi,
  formatMoney,
  type Address,
  type CheckoutSettings,
  type Coupon,
  type OrderItemInput,
  type Product,
} from "../../../_lib/commerceApi";
import { ProductThumb } from "../ProductsTab";

export interface ItemRow {
  key: string;
  variant_id: number | null;
  name: string;
  variant_label: string | null;
  image_url: string | null;
  unit_price: string;
  quantity: number;
}

let seq = 0;
const key = () => `i${++seq}`;

export const toInput = (rows: ItemRow[]): OrderItemInput[] =>
  rows.map((r) => ({
    variant_id: r.variant_id,
    name: r.variant_id ? undefined : r.name.trim(),
    unit_price: r.unit_price.trim() === "" ? null : Number(r.unit_price),
    quantity: r.quantity,
  }));

/** Products picked for an order: search, pick a size, change price or quantity, or add a custom line. */
export function ItemsEditor({
  rows,
  onChange,
  currency,
  error,
}: {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  currency: string;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState<Product | null>(null);
  const q = useDebouncedValue(search, 250);
  const { data, isFetching } = useQuery({
    queryKey: COMMERCE_QK.PRODUCTS({ search: q, per_page: 20, picker: "order" }),
    queryFn: ({ signal }) => commerceApi.products({ search: q, per_page: 20 }, signal),
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const add = (p: Product, variantId?: number) => {
    const v = variantId ? p.variants.find((x) => x.id === variantId) : p.variants[0];
    if (!v) return;
    const existing = rows.find((r) => r.variant_id === v.id);
    if (existing) {
      onChange(rows.map((r) => (r.key === existing.key ? { ...r, quantity: r.quantity + 1 } : r)));
    } else {
      onChange([
        ...rows,
        {
          key: key(),
          variant_id: v.id,
          name: p.name,
          variant_label: v.label || null,
          image_url: v.image_url ?? p.image_url,
          unit_price: String(v.sale_price ?? v.price),
          quantity: 1,
        },
      ]);
    }
    setChoosing(null);
    setOpen(false);
    setSearch("");
  };
  const pick = (p: Product) => (p.variants.length > 1 ? setChoosing(p) : add(p));
  const set = (k: string, patch: Partial<ItemRow>) =>
    onChange(rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          aria-label="Add a product"
          name="item-search"
          leftIcon={Search}
          placeholder="Search products to add"
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            setChoosing(null);
          }}
          error={error}
        />
        {open && (
          <div className="border-line bg-surface absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border shadow-lg">
            {choosing ? (
              <div className="p-3">
                <p className="text-fg mb-2 text-sm font-medium">Which {choosing.name}?</p>
                <div className="flex flex-wrap gap-1.5">
                  {choosing.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={v.stock === 0}
                      onClick={() => add(choosing, v.id)}
                      className="border-line hover:border-primary hover:text-primary rounded-lg border px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {v.label} · {v.price_text}
                      {v.stock === 0 ? " · out" : ""}
                    </button>
                  ))}
                </div>
              </div>
            ) : (data?.items ?? []).length === 0 ? (
              <p className="text-fg-subtle px-3 py-6 text-center text-sm">
                {isFetching ? "Searching…" : "No products found"}
              </p>
            ) : (
              <ul role="listbox" aria-label="Products to add">
                {data!.items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => pick(p)}
                      className="hover:bg-hover flex w-full items-center gap-3 px-3 py-2 text-left"
                    >
                      <ProductThumb src={p.image_url} className="h-9 w-9" />
                      <span className="min-w-0 flex-1">
                        <span className="text-fg block truncate text-sm font-medium">{p.name}</span>
                        <span className="text-fg-subtle block truncate text-xs">
                          {p.price_text}
                          {p.variants.length > 1 ? ` · ${p.variants.length} options` : ""}
                          {p.out_of_stock ? " · out of stock" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-line flex justify-between gap-2 border-t p-2">
              <Button
                size="sm"
                variant="ghost"
                leftIcon={PackagePlus}
                onClick={() => {
                  onChange([
                    ...rows,
                    {
                      key: key(),
                      variant_id: null,
                      name: search.trim(),
                      variant_label: null,
                      image_url: null,
                      unit_price: "",
                      quantity: 1,
                    },
                  ]);
                  setOpen(false);
                  setSearch("");
                }}
              >
                Add a custom item
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="border-line divide-line divide-y rounded-xl border" aria-label="Order items">
          {rows.map((r) => {
            const price = Number(r.unit_price || 0);
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-3 p-3">
                <ProductThumb src={r.image_url} className="h-11 w-11" />
                <div className="min-w-0 flex-1 basis-40">
                  {r.variant_id ? (
                    <>
                      <p className="text-fg truncate text-sm font-medium">{r.name}</p>
                      {r.variant_label && (
                        <p className="text-fg-subtle truncate text-xs">{r.variant_label}</p>
                      )}
                    </>
                  ) : (
                    <Input
                      aria-label="Item name"
                      name={`${r.key}-name`}
                      placeholder="Item name, e.g. Gift wrap"
                      value={r.name}
                      onChange={(e) => set(r.key, { name: e.target.value })}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Price of ${r.name || "item"}`}
                    name={`${r.key}-price`}
                    inputMode="decimal"
                    placeholder="Price"
                    value={r.unit_price}
                    onChange={(e) => set(r.key, { unit_price: e.target.value })}
                    wrapperClassName="w-24"
                  />
                  <div className="border-line flex items-center rounded-lg border">
                    <button
                      type="button"
                      aria-label={`One less ${r.name}`}
                      onClick={() => set(r.key, { quantity: Math.max(1, r.quantity - 1) })}
                      className="text-fg-subtle hover:text-fg p-2"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-fg w-7 text-center text-sm font-semibold tabular-nums">
                      {r.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`One more ${r.name}`}
                      onClick={() => set(r.key, { quantity: r.quantity + 1 })}
                      className="text-fg-subtle hover:text-fg p-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-fg w-20 text-right text-sm font-semibold tabular-nums">
                    {formatMoney(price * r.quantity, currency)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${r.name || "item"}`}
                    onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                    className="text-fg-faint hover:text-danger hover:bg-danger-soft rounded-md p-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const EMPTY_ADDRESS: Address = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  country: "",
};

export function AddressFields({
  value,
  onChange,
  error,
}: {
  value: Address;
  onChange: (a: Address) => void;
  error?: string;
}) {
  const field = (k: keyof Address, label: string, props: Record<string, unknown> = {}) => (
    <Input
      label={label}
      name={`address-${k}`}
      value={(value[k] as string) ?? ""}
      onChange={(e) => onChange({ ...value, [k]: e.target.value })}
      {...props}
    />
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("name", "Name")}
      {field("phone", "Phone", { inputMode: "tel" })}
      <div className="sm:col-span-2">
        {field("line1", "Address", { placeholder: "House, street, area", error, required: true })}
      </div>
      {field("line2", "Apartment, floor (optional)")}
      {field("landmark", "Landmark (optional)")}
      {field("city", "City")}
      {field("state", "State")}
      {field("pincode", "PIN / postcode", { inputMode: "numeric" })}
      {field("country", "Country")}
    </div>
  );
}

export function cleanAddress(a: Address): Address | null {
  const out = Object.fromEntries(
    Object.entries(a).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])
  ) as Address;
  return out.line1 ? out : null;
}

export interface Estimate {
  subtotal: number;
  discount: number;
  prepaid_discount: number;
  shipping: number;
  cod_fee: number;
  tax: number;
  total: number;
  couponProblem: string | null;
}

/** The same sums the server does, to show totals while the order is being made. */
export function estimate(
  rows: ItemRow[],
  checkout: CheckoutSettings | undefined,
  coupon: Coupon | null,
  paymentMethod: "cod" | "online" | null
): Estimate {
  const cents = (n: number) => Math.round(n * 100);
  const subtotal = rows.reduce((s, r) => s + cents(Number(r.unit_price || 0)) * r.quantity, 0);
  let discount = 0;
  let freeShip = false;
  let couponProblem: string | null = null;
  if (coupon) {
    const min = coupon.min_order ? cents(coupon.min_order) : 0;
    if (coupon.state !== "active") couponProblem = `This coupon is ${coupon.state.replace("_", " ")}`;
    else if (subtotal < min)
      couponProblem = `Needs an order of at least ${formatMoney(coupon.min_order, checkout?.currency ?? "INR")}`;
    else if (coupon.kind === "percent") {
      discount = Math.floor((subtotal * coupon.value) / 100);
      if (coupon.max_discount) discount = Math.min(discount, cents(coupon.max_discount));
    } else if (coupon.kind === "fixed") discount = Math.min(cents(coupon.value), subtotal);
    else freeShip = true;
  }
  let after = subtotal - discount;
  let shipping = freeShip || !rows.length || !checkout ? 0 : cents(checkout.shipping_fee);
  if (checkout?.free_shipping_above != null && after >= cents(checkout.free_shipping_above)) shipping = 0;
  // paying online can earn a discount (same rule as the server)
  let prepaid = 0;
  if (paymentMethod === "online" && checkout?.prepaid_kind && checkout.prepaid_value) {
    prepaid =
      checkout.prepaid_kind === "percent"
        ? Math.floor((after * checkout.prepaid_value) / 100)
        : Math.min(cents(checkout.prepaid_value), after);
  }
  after -= prepaid;
  const codFee = paymentMethod === "cod" && checkout ? cents(checkout.cod_fee) : 0;
  const rate = (checkout?.tax_percent ?? 0) / 100;
  let tax = 0;
  let total = after + shipping + codFee;
  if (rate) {
    if (checkout?.tax_inclusive) tax = Math.round(after - after / (1 + rate));
    else {
      tax = Math.round(after * rate);
      total += tax;
    }
  }
  const major = (n: number) => n / 100;
  return {
    subtotal: major(subtotal),
    discount: major(discount),
    prepaid_discount: major(prepaid),
    shipping: major(shipping),
    cod_fee: major(codFee),
    tax: major(tax),
    total: major(total),
    couponProblem,
  };
}

export function TotalsList({
  t,
  currency,
  coupon,
  taxInclusive,
  className,
}: {
  t: Pick<Estimate, "subtotal" | "discount" | "shipping" | "cod_fee" | "tax" | "total"> & {
    prepaid_discount?: number;
  };
  currency: string;
  coupon?: string | null;
  taxInclusive?: boolean;
  className?: string;
}) {
  const m = (n: number) => formatMoney(n, currency);
  const row = (label: string, value: string, strong?: boolean) => (
    <div
      className={cn(
        "flex justify-between gap-3",
        strong ? "text-fg text-base font-semibold" : "text-fg-subtle"
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      {row("Subtotal", m(t.subtotal))}
      {t.discount > 0 && row(`Discount${coupon ? ` (${coupon})` : ""}`, `−${m(t.discount)}`)}
      {!!t.prepaid_discount && row("Paying online", `−${m(t.prepaid_discount)}`)}
      {row("Delivery", t.shipping ? m(t.shipping) : "Free")}
      {t.cod_fee > 0 && row("Cash on delivery fee", m(t.cod_fee))}
      {t.tax > 0 && !taxInclusive && row("Tax", m(t.tax))}
      <div className="border-line border-t pt-2">{row("Total", m(t.total), true)}</div>
      {t.tax > 0 && taxInclusive && (
        <p className="text-fg-faint text-right text-xs">Includes {m(t.tax)} tax</p>
      )}
    </div>
  );
}
