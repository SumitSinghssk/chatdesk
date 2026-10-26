"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  CreditCard,
  Link2,
  MessageSquareMore,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dropdown,
  Input,
  Modal,
  RadioGroup,
  Switch,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import {
  ordersApi,
  paymentsApi,
  type OrderDetail as Detail,
  type OrderPayment,
} from "../../../_lib/commerceApi";
import { COD_CHECK, PaymentBadge, PayStatusBadge, REFUND_STATUS } from "./labels";

async function copy(text: string, what = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy. Select the link and copy it yourself.");
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fg-subtle">{label}</span>
      <span className="text-fg min-w-0 text-right">{children}</span>
    </div>
  );
}

function PaymentRow({
  p,
  busy,
  onAction,
}: {
  p: OrderPayment;
  busy: boolean;
  onAction: (key: "check" | "resend" | "cancel", p: OrderPayment) => void;
}) {
  const open = p.status === "created";
  const sub = [
    p.method_label,
    p.purpose === "prepaid" ? "instead of COD" : null,
    p.status === "paid" && p.paid_at
      ? `paid ${timeAgo(p.paid_at)}`
      : open && p.expires_at
        ? `works until ${formatDateTime(p.expires_at)}`
        : timeAgo(p.created_at),
    p.reminders_sent ? `${p.reminders_sent} reminder${p.reminders_sent === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return (
    <li className="flex items-start gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-fg flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span className="tabular-nums">{p.amount_text}</span>
          <span className="text-fg-subtle text-xs font-normal">{p.provider_label}</span>
          <PayStatusBadge status={p.status} />
        </p>
        <p className="text-fg-faint mt-0.5 text-xs" title={formatDateTime(p.created_at)}>
          {sub.join(" · ")}
        </p>
        {p.refunded_text && <p className="text-fg-subtle text-xs">{p.refunded_text} refunded</p>}
        {p.error && p.status !== "paid" && <p className="text-danger text-xs break-words">{p.error}</p>}
      </div>
      {open && (
        <Dropdown
          align="right"
          width="w-52"
          trigger={() => (
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              leftIcon={MoreHorizontal}
              loading={busy}
              aria-label={`Options for the ${p.amount_text} payment`}
            />
          )}
          items={[
            ...(p.url ? [{ label: "Copy link", icon: Copy, onClick: () => copy(p.url!) }] : []),
            { label: "Check if paid", icon: RefreshCw, onClick: () => onAction("check", p) },
            ...(p.url ? [{ label: "Send again", icon: Send, onClick: () => onAction("resend", p) }] : []),
            { label: "Cancel link", icon: XCircle, onClick: () => onAction("cancel", p), danger: true },
          ]}
        />
      )}
    </li>
  );
}

function RefundModal({
  order,
  onClose,
  onDone,
}: {
  order: Detail;
  onClose: () => void;
  onDone: (o: Detail) => void;
}) {
  const gateway = order.payments.find((p) => p.status === "paid")?.provider_label;
  const [amount, setAmount] = useState(String(order.refundable));
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"gateway" | "manual">(order.can_refund_online ? "gateway" : "manual");
  const [cancel, setCancel] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canCancel = !["delivered", "cancelled"].includes(order.status);

  const run = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return setErrors({ amount: "Enter the amount to refund" });
    if (value > order.refundable)
      return setErrors({ amount: `You can refund up to ${order.refundable_text}` });
    setBusy(true);
    try {
      const res = await ordersApi.refund(order.id, {
        amount: value,
        reason: reason.trim() || null,
        method,
        cancel_order: canCancel && cancel,
        notify,
      });
      toast.success(res.message ?? "Refunded");
      onDone(res.data);
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Refund ${order.ref}`}
      description={`Paid ${order.paid_text ?? order.total_text}${order.refunded_text ? ` · ${order.refunded_text} already refunded` : ""}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button loading={busy} onClick={run} leftIcon={Undo2}>
            {method === "gateway" ? "Refund" : "Record refund"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label={`Amount (${order.currency})`}
          name="refund_amount"
          inputMode="decimal"
          value={amount}
          error={errors.amount}
          hint={`Up to ${order.refundable_text}`}
          onChange={(e) => {
            setAmount(e.target.value);
            setErrors({});
          }}
        />
        <Input
          label="Reason (optional)"
          name="refund_reason"
          maxLength={300}
          placeholder="e.g. Item damaged, returned"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {order.can_refund_online && (
          <RadioGroup<"gateway" | "manual">
            label="How"
            value={method}
            onChange={setMethod}
            error={errors.method}
            options={[
              {
                value: "gateway",
                label: `Through ${gateway ?? "the gateway"}`,
                description: "Back to the UPI, card or bank they paid with. Usually 5–7 working days.",
              },
              {
                value: "manual",
                label: "I refunded it myself",
                description: "Cash or bank transfer: this just records it.",
              },
            ]}
          />
        )}
        {canCancel && (
          <Switch
            label="Also cancel the order"
            hint="Stock goes back, and any coupon use is returned."
            checked={cancel}
            onChange={setCancel}
          />
        )}
        <Switch
          label="Tell the customer on WhatsApp"
          hint="When the refund goes through."
          checked={notify}
          onChange={setNotify}
        />
      </div>
    </Modal>
  );
}

/** The order page's payment card: what's paid, payment links (send, copy, check, cancel), refunds, and asking
 * cash-on-delivery buyers to confirm. */
export function PaymentCard({ order, onChange }: { order: Detail; onChange: (o: Detail) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refund, setRefund] = useState(false);
  const hasChat = !!order.contact.conversation_id;
  const prepaid =
    order.payment_method === "cod" && !["awaiting_address", "awaiting_payment"].includes(order.status);

  const link = async (send: boolean) => {
    setBusy(send ? "send" : "copy");
    try {
      const res = await ordersApi.paymentLink(order.id, send);
      onChange(res.data);
      if (send) toast.success(res.message ?? "Payment link sent");
      else if (res.data.payment.url) await copy(res.data.payment.url, "Payment link copied");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const reload = async (message?: string) => {
    const res = await ordersApi.get(order.id);
    onChange(res.data);
    if (message) toast.success(message);
  };
  const onAction = async (key: "check" | "resend" | "cancel", p: OrderPayment) => {
    setBusy(`${key}-${p.id}`);
    try {
      const res = await (key === "check"
        ? paymentsApi.check(p.id)
        : key === "resend"
          ? paymentsApi.resend(p.id)
          : paymentsApi.cancel(p.id));
      await reload(res.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const askCod = async () => {
    setBusy("cod");
    try {
      const res = await ordersApi.askCod(order.id);
      onChange(res.data);
      toast.success(res.message ?? "Asked the customer");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Payment"
        icon={CreditCard}
        actions={
          order.refundable > 0 ? (
            <Button size="sm" variant="ghost" leftIcon={Undo2} onClick={() => setRefund(true)}>
              Refund
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-3 text-sm">
        <div className="space-y-2">
          <Row label="Status">
            <PaymentBadge order={order} />
          </Row>
          <Row label="Method">
            {order.payment_method === "cod"
              ? "Cash on delivery"
              : order.payment_method === "online"
                ? `Online${order.payments.find((p) => p.status === "paid")?.method_label ? ` · ${order.payments.find((p) => p.status === "paid")!.method_label}` : ""}`
                : "—"}
          </Row>
          <Row label="Total">
            <span className="font-semibold">{order.total_text}</span>
          </Row>
          {order.refunded_text && <Row label="Refunded">{order.refunded_text}</Row>}
          {order.coupon_code && (
            <Row label="Coupon">
              <Badge tone="success">{order.coupon_code}</Badge>
            </Row>
          )}
        </div>

        {(order.cod_check || order.can_ask_cod) && (
          <div className="border-line space-y-2 border-t pt-3">
            {order.cod_check && (
              <Badge tone={COD_CHECK[order.cod_check].tone} dot>
                {COD_CHECK[order.cod_check].label}
              </Badge>
            )}
            {order.can_ask_cod && order.cod_check !== "confirmed" && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={MessageSquareMore}
                loading={busy === "cod"}
                onClick={askCod}
                fullWidth
              >
                {order.cod_check === "pending" ? "Ask again to confirm" : "Ask the customer to confirm"}
              </Button>
            )}
          </div>
        )}

        {order.online.can_link ? (
          <div className="border-primary/20 bg-primary-soft/50 space-y-2.5 rounded-lg border p-3">
            <p className="text-fg">
              <span className="font-semibold">
                {prepaid ? "Pay now instead" : "Pay online"}: {order.online.amount_text}
              </span>
              {order.online.saving_text && (
                <span className="text-fg-subtle"> · saves the customer {order.online.saving_text}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {hasChat && (
                <Button size="sm" leftIcon={Send} loading={busy === "send"} onClick={() => link(true)}>
                  Send payment link
                </Button>
              )}
              {order.online.gateway !== "WhatsApp Pay" && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={Link2}
                  loading={busy === "copy"}
                  onClick={() => link(false)}
                >
                  {hasChat ? "Copy a link" : "Create a link to share"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          !order.online.ready &&
          order.payment_status === "unpaid" &&
          order.status !== "cancelled" && (
            <p className="text-fg-subtle text-xs">
              <Link
                href={`${CUSTOMER_ROUTES.COMMERCE()}?tab=payments&view=setup`}
                className="text-primary font-medium hover:underline"
              >
                Connect a payment gateway
              </Link>{" "}
              to send payment links.
            </p>
          )
        )}

        {order.payments.length > 0 && (
          <div className="border-line border-t pt-2">
            <p className="text-fg-subtle text-xs font-medium">Payment links</p>
            <ul className="divide-line divide-y" aria-label="Payments">
              {order.payments.map((p) => (
                <PaymentRow key={p.id} p={p} busy={!!busy?.endsWith(`-${p.id}`)} onAction={onAction} />
              ))}
            </ul>
          </div>
        )}

        {order.refunds.length > 0 && (
          <div className="border-line border-t pt-2">
            <p className="text-fg-subtle text-xs font-medium">Refunds</p>
            <ul className="divide-line divide-y" aria-label="Refunds">
              {order.refunds.map((r) => (
                <li key={r.id} className="py-2.5">
                  <p className="text-fg flex flex-wrap items-center gap-2 font-medium">
                    <span className="tabular-nums">{r.amount_text}</span>
                    <span className="text-fg-subtle text-xs font-normal">{r.provider_label}</span>
                    <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge>
                  </p>
                  <p className="text-fg-faint text-xs" title={formatDateTime(r.created_at)}>
                    {[r.reason, r.created_by, timeAgo(r.created_at)].filter(Boolean).join(" · ")}
                  </p>
                  {r.error && <p className="text-danger text-xs">{r.error}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={ordersApi.invoiceUrl(order.invoice_key)}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1 pt-1 text-xs font-medium hover:underline"
        >
          <Receipt className="h-3.5 w-3.5" aria-hidden /> View invoice
        </a>
      </CardBody>
      {refund && <RefundModal order={order} onClose={() => setRefund(false)} onDone={onChange} />}
    </Card>
  );
}
