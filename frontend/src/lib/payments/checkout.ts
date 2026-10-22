import { openRazorpay } from "./razorpay";

export type CheckoutOutcome =
  | { status: "completed"; data: Record<string, string> }
  | { status: "failed"; orderId: string; error: string }
  | { status: "dismissed"; orderId: string };

export interface CheckoutSession {
  payment_id: number;
  gateway: string;
  test_mode: boolean;
  checkout: Record<string, unknown>;
}

const LAUNCHERS: Record<string, (options: Record<string, unknown>) => Promise<CheckoutOutcome>> = {
  razorpay: openRazorpay,
};

export function openCheckout(session: CheckoutSession): Promise<CheckoutOutcome> {
  const launch = LAUNCHERS[session.gateway];
  if (!launch) return Promise.reject(new Error(`Checkout for "${session.gateway}" isn't supported yet`));
  return launch(session.checkout);
}

export function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
