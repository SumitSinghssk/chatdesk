"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, TicketPercent, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  type BadgeTone,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { formatDate } from "@/lib/utils";

import { Tooltip } from "../../_components/Tooltip";
import { ORDERS_QK, ordersApi, type Coupon, type CouponKind } from "../../_lib/commerceApi";

const STATE: Record<Coupon["state"], { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "neutral" },
  used_up: { label: "Used up", tone: "neutral" },
  inactive: { label: "Off", tone: "neutral" },
};

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const num = (v: number | null) => (v === null || v === undefined ? "" : String(v));

function CouponModal({
  coupon,
  currency,
  onClose,
}: {
  coupon: Coupon | null;
  currency: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    kind: (coupon?.kind ?? "percent") as CouponKind,
    value: num(coupon?.value ?? null),
    min_order: num(coupon?.min_order ?? null),
    max_discount: num(coupon?.max_discount ?? null),
    starts_at: dateInput(coupon?.starts_at ?? null),
    ends_at: dateInput(coupon?.ends_at ?? null),
    usage_limit: num(coupon?.usage_limit ?? null),
    per_customer: num(coupon?.per_customer ?? null),
    active: coupon?.active ?? true,
    description: coupon?.description ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setProblem("");
  };
  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = async () => {
    if (!form.code.trim()) return setErrors({ code: "Give the coupon a code" });
    setSaving(true);
    try {
      const body = {
        code: form.code.trim(),
        kind: form.kind,
        value: form.kind === "free_shipping" ? 0 : (n(form.value) ?? 0),
        min_order: n(form.min_order),
        max_discount: form.kind === "percent" ? n(form.max_discount) : null,
        starts_at: form.starts_at ? `${form.starts_at}T00:00:00` : null,
        ends_at: form.ends_at ? `${form.ends_at}T23:59:59` : null,
        usage_limit: n(form.usage_limit),
        per_customer: n(form.per_customer),
        active: form.active,
        description: form.description.trim() || null,
      };
      const res = coupon ? await ordersApi.updateCoupon(coupon.id, body) : await ordersApi.createCoupon(body);
      toast.success(res.message ?? "Coupon saved");
      await queryClient.invalidateQueries({ queryKey: ORDERS_QK.COUPONS });
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) {
        setErrors(err.errors);
        const known = ["code", "value", "ends_at"].some((k) => err.errors[k]);
        setProblem(known ? "" : err.message);
      } else setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={coupon ? `Edit ${coupon.code}` : "New coupon"}
      description="Customers type the code in the chat while checking out, or your team adds it to an order."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save coupon
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {problem && <p className="text-danger text-sm">{problem}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            name="code"
            required
            maxLength={30}
            value={form.code}
            error={errors.code}
            placeholder="e.g. DIWALI10"
            onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
          />
          <Select
            id="coupon-kind"
            label="Discount"
            value={form.kind}
            options={[
              { value: "percent", label: "Percent off" },
              { value: "fixed", label: `Amount off (${currency})` },
              { value: "free_shipping", label: "Free delivery" },
            ]}
            onChange={(kind) => set({ kind: kind as CouponKind })}
          />
          {form.kind !== "free_shipping" && (
            <Input
              label={form.kind === "percent" ? "Percent" : `Amount (${currency})`}
              name="value"
              inputMode="decimal"
              value={form.value}
              error={errors.value}
              placeholder={form.kind === "percent" ? "10" : "100"}
              onChange={(e) => set({ value: e.target.value })}
            />
          )}
          {form.kind === "percent" && (
            <Input
              label={`Most it can take off (${currency})`}
              name="max_discount"
              inputMode="decimal"
              placeholder="No limit"
              value={form.max_discount}
              onChange={(e) => set({ max_discount: e.target.value })}
            />
          )}
          <Input
            label={`Minimum order (${currency})`}
            name="min_order"
            inputMode="decimal"
            placeholder="None"
            value={form.min_order}
            onChange={(e) => set({ min_order: e.target.value })}
          />
          <Input
            label="Starts"
            name="starts_at"
            type="date"
            value={form.starts_at}
            onChange={(e) => set({ starts_at: e.target.value })}
          />
          <Input
            label="Ends"
            name="ends_at"
            type="date"
            value={form.ends_at}
            error={errors.ends_at}
            onChange={(e) => set({ ends_at: e.target.value })}
          />
          <Input
            label="Total uses"
            name="usage_limit"
            inputMode="numeric"
            placeholder="Unlimited"
            value={form.usage_limit}
            onChange={(e) => set({ usage_limit: e.target.value.replace(/\D/g, "") })}
          />
          <Input
            label="Uses per customer"
            name="per_customer"
            inputMode="numeric"
            placeholder="Unlimited"
            value={form.per_customer}
            onChange={(e) => set({ per_customer: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <Input
          label="Description (for your team)"
          name="description"
          maxLength={200}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
        <Switch label="Active" checked={form.active} onChange={(active) => set({ active })} />
      </div>
    </Modal>
  );
}

export function CouponsTab() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const { data: coupons } = useQuery({
    queryKey: ORDERS_QK.COUPONS,
    queryFn: async () => (await ordersApi.coupons()).data,
  });
  const { data: checkout } = useQuery({
    queryKey: ORDERS_QK.CHECKOUT,
    queryFn: async () => (await ordersApi.checkout()).data,
  });
  const currency = checkout?.currency ?? "INR";

  const remove = async (c: Coupon) => {
    const ok = await confirm({
      title: `Delete ${c.code}?`,
      message: "Orders that used it keep their discount.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await ordersApi.deleteCoupon(c.id);
      toast.success("Coupon deleted");
      await queryClient.invalidateQueries({ queryKey: ORDERS_QK.COUPONS });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const rules = (c: Coupon) =>
    [
      c.min_order ? `min ${c.min_order}` : null,
      c.ends_at ? `until ${formatDate(c.ends_at)}` : null,
      c.usage_limit ? `${c.used}/${c.usage_limit} used` : `${c.used} used`,
      c.per_customer ? `${c.per_customer} per customer` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-subtle max-w-xl text-sm">
          While checking out, customers can reply with a code to get the discount.
        </p>
        <Button leftIcon={Plus} onClick={() => setEditing("new")}>
          New coupon
        </Button>
      </div>
      {!coupons ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No coupons yet"
          description="Make a code like DIWALI10 for 10% off, a flat amount off, or free delivery."
          action={
            <Button leftIcon={Plus} onClick={() => setEditing("new")}>
              New coupon
            </Button>
          }
        />
      ) : (
        <ul className="border-line divide-line divide-y rounded-xl border" aria-label="Coupons">
          {coupons.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <TicketPercent className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="font-mono">{c.code}</span>
                  <span className="text-fg-subtle font-normal">{c.label}</span>
                  <Badge tone={STATE[c.state].tone} dot>
                    {STATE[c.state].label}
                  </Badge>
                </p>
                <p className="text-fg-subtle truncate text-xs">{rules(c)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip label="Edit">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    leftIcon={Pencil}
                    aria-label={`Edit ${c.code}`}
                    onClick={() => setEditing(c)}
                    className="text-fg-faint hover:bg-primary-soft hover:text-primary"
                  />
                </Tooltip>
                <Tooltip label="Delete" align="end">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    leftIcon={Trash2}
                    aria-label={`Delete ${c.code}`}
                    onClick={() => remove(c)}
                    className="text-fg-faint hover:text-danger hover:bg-danger-soft"
                  />
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <CouponModal
          coupon={editing === "new" ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
