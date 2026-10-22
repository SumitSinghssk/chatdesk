import { getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { CheckoutSession } from "@/lib/payments/checkout";
import type { SmsGatewayField } from "./smsApi";
import type { ListParams } from "./types";

export interface PaymentGatewaySpec {
  key: string;
  label: string;
  website: string;
  dashboard_url: string;
  fields: SmsGatewayField[];
  webhook_events: string[];
  currencies: string[];
  webhook_url: string;
}

export type PaymentGatewayValues = Record<string, string | boolean | null>;

export interface PaymentSettings {
  currency: string;
  default_gateway: string;
  gateways: Record<string, PaymentGatewayValues>;
}

export interface PaymentConfig {
  settings: PaymentSettings;
  gateways: PaymentGatewaySpec[];
}

export type PaymentStatus = "created" | "paid" | "failed" | "refunded";

export interface PaymentRecord {
  id: number;
  gateway: string;
  gateway_label: string;
  purpose: string;
  reference: string | null;
  customer_id: number | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  test_mode: boolean;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  method: string | null;
  description: string | null;
  payer: Record<string, string>;
  error: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PaymentWebhookLog {
  id: number;
  gateway: string;
  gateway_label: string;
  event: string;
  event_id: string | null;
  payment_id: number | null;
  signature_valid: boolean;
  status: "processed" | "ignored" | "rejected" | "received";
  error: string | null;
  created_at: string;
}

const E = ADMIN_ENDPOINTS.PAYMENTS;

export const paymentsApi = {
  show: () => getOne<PaymentConfig>(E.SETTINGS),
  update: (data: PaymentSettings) => send<PaymentConfig>("put", E.SETTINGS, data),
  testConnection: (gateway: string) => send<{ test_mode: boolean }>("post", E.TEST_CONNECTION, { gateway }),
  testCheckout: (body: { gateway?: string; amount: number; currency?: string }) =>
    send<CheckoutSession>("post", E.TEST_CHECKOUT, body),
  confirm: (gateway: string, data: Record<string, string>) =>
    send<PaymentRecord>("post", E.CONFIRM, { gateway, data }),
  failed: (gateway: string, order_id: string, error?: string) =>
    send<PaymentRecord | null>("post", E.FAILED, { gateway, order_id, error }),
  transactions: (params: ListParams, signal?: AbortSignal) =>
    getPage<PaymentRecord>(E.TRANSACTIONS, params, signal),
  webhooks: (params: ListParams, signal?: AbortSignal) =>
    getPage<PaymentWebhookLog>(E.WEBHOOKS, params, signal),
};
