"use client";

import { Badge, type BadgeTone } from "@/app/admin/_components/ui/index";

import type {
  GatewayName,
  Order,
  OrderAction,
  OrderPayment,
  OrderRefund,
  OrderStatus,
  PaymentStatus,
} from "../../../_lib/commerceApi";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  awaiting_address: { label: "Needs address", tone: "warning" },
  awaiting_payment: { label: "Choosing payment", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "info" },
  packed: { label: "Packed", tone: "brand" },
  shipped: { label: "Shipped", tone: "brand" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const ACTION_LABELS: Record<OrderAction, string> = {
  confirm: "Confirm order",
  pack: "Mark packed",
  ship: "Mark shipped",
  deliver: "Mark delivered",
  cancel: "Cancel order",
};

export const SOURCE_LABELS: Record<Order["source"], string> = {
  whatsapp_cart: "WhatsApp cart",
  buy_button: "Buy now button",
  manual: "Made by the team",
  chatbot: "Chatbot payment request",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function paymentOf(o: Pick<Order, "payment_status" | "payment_method" | "status">): {
  label: string;
  tone: BadgeTone;
} {
  const status: PaymentStatus = o.payment_status;
  if (status === "paid") return { label: "Paid", tone: "success" };
  if (status === "partially_refunded") return { label: "Partly refunded", tone: "info" };
  if (status === "refunded") return { label: "Refunded", tone: "neutral" };
  if (o.status === "cancelled") return { label: "Not paid", tone: "neutral" };
  if (o.status === "awaiting_address" || o.status === "awaiting_payment")
    return { label: "Not chosen yet", tone: "neutral" };
  if (o.payment_method === "cod") return { label: "Cash on delivery", tone: "warning" };
  return { label: "Unpaid", tone: "danger" };
}

export function PaymentBadge({
  order,
}: {
  order: Pick<Order, "payment_status" | "payment_method" | "status">;
}) {
  const p = paymentOf(order);
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export const GATEWAY_LABELS: Record<GatewayName | "manual", string> = {
  razorpay: "Razorpay",
  cashfree: "Cashfree",
  payu: "PayU",
  stripe: "Stripe",
  whatsapp_pay: "WhatsApp Pay",
  manual: "Recorded by the team",
};

export const PAY_STATUS: Record<OrderPayment["status"], { label: string; tone: BadgeTone }> = {
  created: { label: "Waiting", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function PayStatusBadge({ status }: { status: OrderPayment["status"] }) {
  const s = PAY_STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export const REFUND_STATUS: Record<OrderRefund["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "On its way", tone: "warning" },
  processed: { label: "Refunded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export const COD_CHECK: Record<NonNullable<Order["cod_check"]>, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for the customer to confirm", tone: "warning" },
  confirmed: { label: "Confirmed by the customer", tone: "success" },
  declined: { label: "Declined by the customer", tone: "danger" },
};
