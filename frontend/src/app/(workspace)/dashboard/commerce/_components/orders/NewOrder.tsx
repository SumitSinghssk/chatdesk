"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Receipt, Search, ShoppingBag, StickyNote, Tag, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  Card,
  CardBody,
  ErrorBanner,
  Input,
  RadioGroup,
  Select,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import { COMMERCE_QK, ORDERS_QK, ordersApi, type Address } from "../../../_lib/commerceApi";
import { contactsApi, type Contact } from "../../../_lib/contactsApi";
import { Section } from "../../../templates/_components/editor/parts";
import {
  AddressFields,
  cleanAddress,
  EMPTY_ADDRESS,
  estimate,
  ItemsEditor,
  toInput,
  TotalsList,
  type ItemRow,
} from "./parts";

type Mode = "confirmed" | "checkout" | "link";
type Pay = "cod" | "paid" | "unpaid";

function CustomerPicker({
  value,
  onChange,
  error,
}: {
  value: Contact | null;
  onChange: (c: Contact | null) => void;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 250);
  const { data } = useQuery({
    queryKey: ["contacts", "picker", q],
    queryFn: ({ signal }) => contactsApi.page({ search: q, per_page: 8 }, signal),
    enabled: !value && q.trim().length > 0,
  });
  if (value) {
    return (
      <div className="border-line bg-page/50 flex items-center gap-3 rounded-xl border p-3">
        <Avatar name={value.display_name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-semibold">{value.display_name}</p>
          <p className="text-fg-subtle truncate text-xs">
            {value.phone}
            {value.conversation ? " · has a WhatsApp chat" : " · no chat yet"}
          </p>
        </div>
        <Button size="sm" variant="ghost" leftIcon={X} onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        aria-label="Find a customer"
        name="customer-search"
        leftIcon={Search}
        placeholder="Search contacts by name or number"
        value={search}
        error={error}
        onChange={(e) => setSearch(e.target.value)}
      />
      {q.trim() && (
        <ul
          className="border-line bg-surface absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border shadow-lg"
          role="listbox"
          aria-label="Customers"
        >
          {(data?.items ?? []).length === 0 ? (
            <li className="text-fg-subtle px-3 py-5 text-center text-sm">No contacts match</li>
          ) : (
            data!.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onChange(c);
                    setSearch("");
                  }}
                  className="hover:bg-hover flex w-full items-center gap-3 px-3 py-2 text-left"
                >
                  <Avatar name={c.display_name} size={32} />
                  <span className="min-w-0">
                    <span className="text-fg block truncate text-sm font-medium">{c.display_name}</span>
                    <span className="text-fg-subtle block truncate text-xs">{c.phone}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function NewOrder() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const preset = Number(params.get("contact")) || null;
  const [contact, setContact] = useState<Contact | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [couponCode, setCouponCode] = useState("");
  const [mode, setMode] = useState<Mode>("confirmed");
  const [pay, setPay] = useState<Pay>("cod");
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: checkout } = useQuery({
    queryKey: ORDERS_QK.CHECKOUT,
    queryFn: async () => (await ordersApi.checkout()).data,
  });
  const { data: coupons } = useQuery({
    queryKey: ORDERS_QK.COUPONS,
    queryFn: async () => (await ordersApi.coupons()).data,
  });
  // a contact from ?contact=<id> (e.g. "Create order" in the inbox)
  const { data: presetContact } = useQuery({
    queryKey: ["contacts", "one", preset],
    queryFn: async () => (await contactsApi.get(preset!)).data,
    enabled: !!preset && !contact,
  });
  const customer = contact ?? presetContact ?? null;
  // their last delivery address, offered once a customer is chosen
  const { data: history } = useQuery({
    queryKey: ORDERS_QK.CONTACT(customer?.id ?? 0),
    queryFn: async () => (await ordersApi.forContact(customer!.id)).data,
    enabled: !!customer,
  });
  const lastAddress = history?.orders.find((o) => o.address)?.address ?? null;

  const currency = checkout?.currency ?? "INR";
  const coupon = coupons?.find((c) => c.code === couponCode) ?? null;
  const method =
    mode === "link"
      ? "online"
      : mode === "checkout"
        ? null
        : pay === "cod"
          ? "cod"
          : pay === "paid"
            ? "online"
            : null;
  const online = !!checkout?.online_ready;
  const totals = estimate(rows, checkout, coupon, method);
  const usable = (coupons ?? []).filter((c) => c.state === "active");

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!rows.length) errs.items = "Add at least one item";
    if (rows.some((r) => !r.variant_id && (!r.name.trim() || r.unit_price.trim() === "")))
      errs.items = "Give each custom item a name and price";
    if (mode === "checkout" && !customer) errs.contact_id = "Choose the customer to send it to";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    setProblem("");
    try {
      const res = await ordersApi.create({
        contact_id: customer?.id ?? null,
        items: toInput(rows),
        coupon_code: couponCode || null,
        payment_method: method,
        paid: mode === "confirmed" && pay === "paid",
        address: cleanAddress(address),
        note: note.trim() || null,
        internal_note: internal.trim() || null,
        mode,
      });
      toast.success(res.message ?? "Order created");
      await queryClient.invalidateQueries({ queryKey: ORDERS_QK.ALL });
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
      router.replace(CUSTOMER_ROUTES.COMMERCE_ORDER(res.data.id));
    } catch (err) {
      if (err instanceof CustomerApiError) {
        setErrors(err.errors);
        setProblem(err.message);
      } else setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={CUSTOMER_ROUTES.COMMERCE()}
          aria-label="Back to orders"
          className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-fg truncate text-lg font-semibold">New order</h1>
          <p className="text-fg-subtle truncate text-xs">
            For orders over a call, in the shop, or in a chat. Stock and totals update like any order.
          </p>
        </div>
      </div>

      {problem && <ErrorBanner className="mb-4" message={problem} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Section title="Customer" icon={UserRound} hint="Who the order is for. Optional for walk-in sales.">
            <CustomerPicker
              value={customer}
              onChange={(c) => {
                setContact(c);
                setErrors({});
                if (!c) router.replace(CUSTOMER_ROUTES.COMMERCE_ORDER_NEW());
              }}
              error={errors.contact_id}
            />
          </Section>

          <Section title="Items" icon={ShoppingBag}>
            <ItemsEditor
              rows={rows}
              onChange={(r) => {
                setRows(r);
                setErrors({});
              }}
              currency={currency}
              error={errors.items}
            />
          </Section>

          <Section
            title="Delivery address"
            icon={MapPin}
            optional
            actions={
              lastAddress && !address.line1 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddress({ ...EMPTY_ADDRESS, ...lastAddress })}
                >
                  Use last address
                </Button>
              ) : undefined
            }
          >
            <AddressFields value={address} onChange={setAddress} error={errors["address.line1"]} />
          </Section>

          <Section title="Notes" icon={StickyNote} optional>
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                label="Customer's note"
                name="note"
                rows={3}
                maxLength={2000}
                value={note}
                placeholder="e.g. Gift wrap please"
                onChange={(e) => setNote(e.target.value)}
              />
              <Textarea
                label="Note for your team"
                name="internal_note"
                rows={3}
                maxLength={2000}
                value={internal}
                placeholder="Only your team sees this"
                onChange={(e) => setInternal(e.target.value)}
              />
            </div>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-0" aria-label="Order summary">
          <Card>
            <CardBody className="space-y-4">
              <p className="text-fg flex items-center gap-2 text-sm font-semibold">
                <Receipt className="text-primary h-4 w-4" aria-hidden /> Summary
              </p>
              <Select
                id="coupon"
                label="Coupon"
                icon={Tag}
                value={couponCode}
                options={[
                  { value: "", label: usable.length ? "No coupon" : "No active coupons" },
                  ...usable.map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })),
                ]}
                onChange={setCouponCode}
                error={errors.coupon_code || totals.couponProblem || undefined}
              />
              <TotalsList
                t={totals}
                currency={currency}
                coupon={couponCode}
                taxInclusive={checkout?.tax_inclusive}
              />
              <RadioGroup<Mode>
                label="What happens next"
                value={mode}
                onChange={setMode}
                options={[
                  {
                    value: "confirmed",
                    label: "Confirm it now",
                    description: "The order is final; we message the customer.",
                  },
                  {
                    value: "link",
                    label: "Send a payment link",
                    disabled: !online,
                    description: online
                      ? customer
                        ? "Confirmed by itself when they pay online."
                        : "You get a link to share; confirmed when it's paid."
                      : "Connect a payment gateway in Commerce → Payments first.",
                  },
                  {
                    value: "checkout",
                    label: "Customer confirms in WhatsApp",
                    description: "They get the summary and pick how to pay (needs an open chat).",
                  },
                ]}
              />
              {mode === "confirmed" && (
                <Select
                  id="payment"
                  label="Payment"
                  value={pay}
                  options={[
                    { value: "cod", label: "Cash on delivery" },
                    { value: "paid", label: "Already paid" },
                    { value: "unpaid", label: "Not paid yet" },
                  ]}
                  onChange={(v) => setPay(v as Pay)}
                />
              )}
              <Button fullWidth loading={saving} onClick={save}>
                {mode === "checkout"
                  ? "Send to customer"
                  : mode === "link"
                    ? customer
                      ? "Create and send link"
                      : "Create payment link"
                    : "Create order"}
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
