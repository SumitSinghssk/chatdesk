import type { CheckoutOutcome } from "./checkout";

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  error?: { description?: string; reason?: string; metadata?: { order_id?: string } };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loader: Promise<void> | null = null;

function loadScript() {
  loader ??= new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error("Couldn't load Razorpay checkout. Check your connection or ad blocker."));
    };
    document.body.appendChild(script);
  });
  return loader;
}

export async function openRazorpay(options: Record<string, unknown>): Promise<CheckoutOutcome> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay checkout isn't available");
  const orderId = String(options.order_id ?? "");

  return new Promise<CheckoutOutcome>((resolve) => {
    let failure: string | null = null;
    const instance = new Razorpay({
      ...options,
      handler: (response: RazorpayResponse) => resolve({ status: "completed", data: { ...response } }),
      modal: {
        ondismiss: () =>
          resolve(failure ? { status: "failed", orderId, error: failure } : { status: "dismissed", orderId }),
        confirm_close: true,
      },
    });
    instance.on("payment.failed", (response) => {
      failure = response.error?.description || response.error?.reason || "Payment failed";
    });
    instance.open();
  });
}
