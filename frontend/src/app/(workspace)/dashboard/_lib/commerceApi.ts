import { CustomerApiError, request } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery, type QueryParams } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

import type { InboxMessage } from "./inboxApi";

const C = CUSTOMER_ENDPOINTS.COMMERCE;
const headers = { Accept: "application/json", "X-Requested-With": "sk-web" };

export type ProductStatus = "active" | "hidden" | "draft";
export type SyncState = "synced" | "pending" | "error";

export interface ProductOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: number;
  retailer_id: string;
  option_values: Record<string, string>;
  label: string;
  price: number;
  sale_price: number | null;
  price_text: string;
  stock: number | null;
  image: string | null;
  image_url: string | null;
  sync_state: SyncState;
  sync_error: string | null;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  collection: { id: number; name: string } | null;
  brand: string | null;
  images: { path: string; url: string }[];
  image_url: string | null;
  url: string | null;
  status: ProductStatus;
  condition: "new" | "refurbished" | "used";
  options: ProductOption[];
  variants: ProductVariant[];
  currency: string;
  price_min: number;
  price_max: number;
  price_text: string;
  on_sale: boolean;
  stock: number | null;
  out_of_stock: boolean;
  sync_state: SyncState | null;
  sync_errors: string[];
  source: "manual" | "import" | "meta";
  created_at: string;
  updated_at: string;
}

export interface VariantInput {
  id?: number;
  retailer_id?: string | null;
  option_values: Record<string, string>;
  price: number;
  sale_price?: number | null;
  stock?: number | null;
  image?: string | null;
}

export interface ProductInput {
  name: string;
  description: string | null;
  collection_id: number | null;
  brand: string | null;
  images: string[];
  url: string | null;
  status: ProductStatus;
  condition: Product["condition"];
  options: ProductOption[];
  variants: VariantInput[];
}

export interface ProductStats {
  total: number;
  active: number;
  hidden: number;
  draft: number;
  out_of_stock: number;
  low_stock: number;
  synced: number;
  sync_errors: number;
  catalog_connected: boolean;
  currency: string;
}

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  position: number;
  products: number;
}

export interface StoreSettings {
  currency: string;
  store_name: string | null;
  auto_sync: boolean;
  cart_enabled: boolean;
  catalog_visible: boolean;
  catalog: { id: string; name: string; connected_at: string | null } | null;
  last_sync_at: string | null;
  sync_error: string | null;
}

export interface MetaCatalogs {
  catalogs: { id: string; name: string; products: number | null }[];
  commerce: { cart_enabled: boolean | null; catalog_visible: boolean | null } | null;
}

export type SendKind = "product" | "products" | "catalog" | "card";

export interface ProductPage {
  items: Product[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export const CURRENCIES = [
  { value: "INR", label: "Indian rupee (₹)" },
  { value: "USD", label: "US dollar ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "British pound (£)" },
  { value: "AED", label: "UAE dirham (AED)" },
  { value: "SAR", label: "Saudi riyal (SAR)" },
  { value: "SGD", label: "Singapore dollar (S$)" },
  { value: "AUD", label: "Australian dollar (A$)" },
  { value: "CAD", label: "Canadian dollar (C$)" },
  { value: "IDR", label: "Indonesian rupiah (Rp)" },
  { value: "MYR", label: "Malaysian ringgit (RM)" },
  { value: "BRL", label: "Brazilian real (R$)" },
  { value: "MXN", label: "Mexican peso (MX$)" },
];
const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  BRL: "R$",
  MXN: "MX$",
};

/** ₹1,499 or ₹1,499.50 */
export function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "";
  const whole = Number.isInteger(amount);
  const text = amount.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${SYMBOLS[currency] ?? `${currency} `}${text}`;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = Object.fromEntries(
      Object.entries((body.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0] ?? ""])
    );
    throw new CustomerApiError(body.message ?? "Something went wrong.", res.status, errors);
  }
  return body as T;
}

export const commerceApi = {
  settings: () => request<StoreSettings>("GET", C.SETTINGS),
  saveSettings: (body: Omit<StoreSettings, "catalog" | "last_sync_at" | "sync_error">) =>
    request<StoreSettings>("PUT", C.SETTINGS, body),
  catalogs: () => request<MetaCatalogs>("GET", C.CATALOG),
  connect: (catalog_id: string) => request<StoreSettings>("POST", C.CATALOG_CONNECT, { catalog_id }),
  disconnect: () => request<StoreSettings>("DELETE", C.CATALOG),
  syncNow: () => request<StoreSettings>("POST", C.CATALOG_SYNC),
  importCatalog: () => request<{ created: number; found: number }>("POST", C.CATALOG_IMPORT),

  collections: () => request<Collection[]>("GET", C.COLLECTIONS),
  createCollection: (body: { name: string; description?: string | null }) =>
    request<{ id: number; name: string }>("POST", C.COLLECTIONS, body),
  updateCollection: (id: number, body: { name: string; description?: string | null }) =>
    request<{ id: number; name: string }>("PUT", C.COLLECTION(id), body),
  reorderCollections: (ids: number[]) => request<Collection[]>("PUT", C.COLLECTIONS_ORDER, { ids }),
  deleteCollection: (id: number) => request<null>("DELETE", C.COLLECTION(id)),

  async products(params: QueryParams, signal?: AbortSignal): Promise<ProductPage> {
    const res = await fetch(`${BROWSER_API_BASE_URL}${withQuery(C.PRODUCTS, { page: 1, ...params })}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
    const body = await json<{ data: Product[]; meta: ProductPage["meta"] }>(res);
    return { items: body.data, meta: body.meta };
  },
  stats: () => request<ProductStats>("GET", C.PRODUCT_STATS),
  product: (id: number) => request<Product>("GET", C.PRODUCT(id)),
  create: (body: ProductInput) => request<Product>("POST", C.PRODUCTS, body),
  update: (id: number, body: ProductInput) => request<Product>("PUT", C.PRODUCT(id), body),
  duplicate: (id: number) => request<Product>("POST", C.PRODUCT_DUPLICATE(id)),
  remove: (id: number) => request<null>("DELETE", C.PRODUCT(id)),
  bulk: (
    ids: number[],
    action: "delete" | "activate" | "hide" | "collection" | "sync",
    collection_id?: number
  ) => request<null>("POST", C.PRODUCT_BULK, { ids, action, collection_id }),
  async uploadImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BROWSER_API_BASE_URL}${C.PRODUCT_IMAGES}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: form,
    });
    return (await json<{ data: { path: string; url: string } }>(res)).data;
  },

  send: (
    conversationId: number,
    body: { kind: SendKind; product_ids?: number[]; header?: string; body?: string; footer?: string }
  ) => request<InboxMessage>("POST", C.SEND(conversationId), body),
};

export const COMMERCE_QK = {
  ALL: ["commerce"] as const,
  SETTINGS: ["commerce", "settings"] as const,
  CATALOGS: ["commerce", "catalogs"] as const,
  COLLECTIONS: ["commerce", "collections"] as const,
  STATS: ["commerce", "stats"] as const,
  PRODUCTS: (params: QueryParams) => ["commerce", "products", params] as const,
  PRODUCT: (id: number) => ["commerce", "product", id] as const,
};

// orders, coupons and checkout ---------------------------------------------------------------

export type OrderStatus =
  "awaiting_address" | "awaiting_payment" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";
export type OrderAction = "confirm" | "pack" | "ship" | "deliver" | "cancel";
export type PaymentStatus = "unpaid" | "paid" | "partially_refunded" | "refunded";

export interface Address {
  name?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
}

export interface OrderItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  retailer_id: string | null;
  name: string;
  variant_label: string | null;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  total: number;
  unit_text: string;
  total_text: string;
}

export interface OrderEvent {
  id: number;
  kind: "placed" | "status" | "address" | "message" | "note" | "payment" | "edit";
  text: string;
  actor: string | null;
  created_at: string;
}

export interface Order {
  id: number;
  number: number;
  ref: string;
  status: OrderStatus;
  status_label: string;
  actions: OrderAction[];
  payment_status: PaymentStatus;
  payment_method: "cod" | "online" | null;
  source: "whatsapp_cart" | "buy_button" | "manual" | "chatbot" | "shopify" | "woocommerce";
  /** the store's own order number (Shopify / WooCommerce) */
  external_ref: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  shipping: number;
  cod_fee: number;
  prepaid_discount: number;
  tax: number;
  tax_inclusive: boolean;
  total: number;
  total_text: string;
  coupon_code: string | null;
  /** asking a cash-on-delivery buyer to confirm */
  cod_check: "pending" | "confirmed" | "declined" | null;
  /** abandoned-cart reminders sent, and when one won the order back */
  recovery_sent: number;
  recovered_at: string | null;
  last_recovery_at: string | null;
  items_count: number;
  items_preview: string;
  contact: { id: number | null; name: string | null; phone: string | null; conversation_id: number | null };
  address: Address | null;
  address_text: string;
  placed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  note: string | null;
  internal_note: string | null;
  courier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  invoice_key: string;
  times: Record<
    "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "paid",
    string | null
  >;
  events: OrderEvent[];
  totals: Record<
    "subtotal" | "discount" | "shipping" | "cod_fee" | "prepaid_discount" | "tax" | "total",
    string
  >;
  payments: OrderPayment[];
  refunds: OrderRefund[];
  paid_text: string | null;
  refunded_text: string | null;
  refundable: number;
  refundable_text: string;
  can_refund_online: boolean;
  online: {
    ready: boolean;
    can_link: boolean;
    amount_text: string | null;
    saving_text: string | null;
    gateway: string | null;
  };
  can_ask_cod: boolean;
}

export type GatewayName = "razorpay" | "cashfree" | "payu" | "stripe" | "whatsapp_pay";

export interface OrderPayment {
  id: number;
  reference: string;
  provider: GatewayName;
  provider_label: string;
  status: "created" | "paid" | "failed" | "expired" | "cancelled";
  status_label: string;
  amount: number;
  amount_text: string;
  refunded: number;
  refunded_text: string | null;
  method: string | null;
  method_label: string | null;
  purpose: "checkout" | "prepaid";
  /** the link customers get (null for WhatsApp Pay) */
  url: string | null;
  provider_payment_id: string | null;
  error: string | null;
  reminders_sent: number;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  created_by: string | null;
  order?: { id: number; ref: string; status: OrderStatus; customer: string | null };
}

export interface OrderRefund {
  id: number;
  amount: number;
  amount_text: string;
  status: "pending" | "processed" | "failed";
  provider: GatewayName | "manual";
  provider_label: string;
  provider_ref: string | null;
  reason: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface Gateway {
  id: number;
  provider: GatewayName;
  label: string;
  mode: "test" | "live";
  hint: string | null;
  active: boolean;
  is_default: boolean;
  verified_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
  webhook_url: string | null;
  has_webhook_secret: boolean;
  saved_fields: string[];
  configuration_name?: string | null;
  wa_gateway?: string | null;
}

export interface GatewayProvider {
  provider: GatewayName;
  label: string;
  fields: { key: string; label: string; secret: boolean }[];
  needs_mode: boolean;
  max_expiry_minutes: number;
  webhook_secret: boolean;
  webhook_events: string[];
  gateway: Gateway | null;
}

export type PaymentTemplateKey = "payment_link" | "payment_reminder" | "cod_confirm";

export interface PaymentOptions {
  online_enabled: boolean;
  link_expiry_minutes: number;
  reminders: number[];
  cancel_unpaid: boolean;
  prepaid_kind: "percent" | "fixed" | null;
  prepaid_value: number;
  cod_confirm: boolean;
  cod_to_prepaid: boolean;
  templates: Record<PaymentTemplateKey, number | null>;
  currency: string;
}

export interface PaymentSetup {
  providers: GatewayProvider[];
  options: PaymentOptions;
  ready: boolean;
}

export interface GatewayInput {
  credentials?: Record<string, string>;
  mode?: "test" | "live" | null;
  webhook_secret?: string | null;
  configuration_name?: string | null;
  wa_gateway?: string | null;
  active?: boolean;
  make_default?: boolean;
}

export interface PaymentStats {
  collected_text: string;
  paid_count: number;
  conversion: number | null;
  waiting: number;
  waiting_text: string;
  refunded_text: string;
  ready: boolean;
}

export interface PaymentPage {
  items: OrderPayment[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export interface RefundInput {
  amount: number;
  reason?: string | null;
  method: "gateway" | "manual";
  cancel_order?: boolean;
  notify?: boolean;
}

export interface OrderStats {
  total: number;
  checkout: number;
  to_ship: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  revenue_30d: number;
  revenue_30d_text: string;
  orders_30d: number;
  average_text: string | null;
  cod_due: number;
  cod_due_text: string | null;
  currency: string;
}

export interface OrderPage {
  items: Order[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export interface OrderItemInput {
  variant_id?: number | null;
  name?: string | null;
  unit_price?: number | null;
  quantity: number;
}

export interface OrderInput {
  contact_id?: number | null;
  items: OrderItemInput[];
  coupon_code?: string | null;
  payment_method?: "cod" | "online" | null;
  paid?: boolean;
  address?: Address | null;
  note?: string | null;
  internal_note?: string | null;
  mode: "confirmed" | "checkout" | "link";
}

export type NotifyStep = "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "paid" | "refunded";

export interface CheckoutSettings {
  order_prefix: string;
  next_number: number;
  shipping_fee: number;
  free_shipping_above: number | null;
  tax_percent: number;
  tax_inclusive: boolean;
  cod_enabled: boolean;
  cod_fee: number;
  min_order: number | null;
  ask_address: boolean;
  notifications: Record<NotifyStep, { on: boolean; template_id: number | null }>;
  currency: string;
  /** paying online can earn a discount */
  prepaid_kind: "percent" | "fixed" | null;
  prepaid_value: number;
  /** a payment gateway (or WhatsApp Pay) is connected and online payment is on */
  online_ready: boolean | null;
}

export type CouponKind = "percent" | "fixed" | "free_shipping";

export interface Coupon {
  id: number;
  code: string;
  kind: CouponKind;
  value: number;
  label: string;
  min_order: number | null;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer: number | null;
  used: number;
  active: boolean;
  state: "active" | "inactive" | "scheduled" | "expired" | "used_up";
  description: string | null;
}

export type CouponInput = Omit<Coupon, "id" | "label" | "used" | "state">;

export interface ContactOrders {
  orders: Order[];
  count: number;
  spent: number;
  spent_text: string;
}

export const ordersApi = {
  async page(params: QueryParams, signal?: AbortSignal): Promise<OrderPage> {
    const res = await fetch(`${BROWSER_API_BASE_URL}${withQuery(C.ORDERS, { page: 1, ...params })}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
    const body = await json<{ data: Order[]; meta: OrderPage["meta"] }>(res);
    return { items: body.data, meta: body.meta };
  },
  stats: () => request<OrderStats>("GET", C.ORDER_STATS),
  get: (id: number) => request<OrderDetail>("GET", C.ORDER(id)),
  create: (body: OrderInput) => request<OrderDetail>("POST", C.ORDERS, body),
  update: (
    id: number,
    body: Partial<Omit<OrderInput, "mode" | "paid" | "contact_id">> & Record<string, unknown>
  ) => request<OrderDetail>("PUT", C.ORDER(id), body),
  act: (
    id: number,
    body: {
      action: OrderAction;
      courier?: string;
      tracking_number?: string;
      tracking_url?: string;
      reason?: string;
      notify?: boolean;
    }
  ) => request<OrderDetail>("POST", C.ORDER_ACTION(id), body),
  payment: (id: number, payment_status: PaymentStatus, payment_method?: "cod" | "online") =>
    request<OrderDetail>("PUT", C.ORDER_PAYMENT(id), { payment_status, payment_method }),
  note: (id: number, text: string) => request<OrderDetail>("POST", C.ORDER_NOTES(id), { text }),
  send: (id: number) => request<OrderDetail>("POST", C.ORDER_SEND(id)),
  forContact: (contactId: number) => request<ContactOrders>("GET", C.CONTACT_ORDERS(contactId)),
  invoiceUrl: (key: string) => `${BROWSER_API_BASE_URL}${C.INVOICE(key)}`,

  checkout: () => request<CheckoutSettings>("GET", C.CHECKOUT),
  saveCheckout: (
    body: Omit<
      CheckoutSettings,
      "next_number" | "currency" | "prepaid_kind" | "prepaid_value" | "online_ready"
    >
  ) => request<CheckoutSettings>("PUT", C.CHECKOUT, body),
  coupons: () => request<Coupon[]>("GET", C.COUPONS),
  createCoupon: (body: CouponInput) => request<Coupon>("POST", C.COUPONS, body),
  updateCoupon: (id: number, body: CouponInput) => request<Coupon>("PUT", C.COUPON(id), body),
  deleteCoupon: (id: number) => request<null>("DELETE", C.COUPON(id)),

  paymentLink: (id: number, send = true) =>
    request<OrderDetail & { payment: OrderPayment }>("POST", C.ORDER_PAYMENT_LINK(id), { send }),
  refund: (id: number, body: RefundInput) => request<OrderDetail>("POST", C.ORDER_REFUNDS(id), body),
  askCod: (id: number) => request<OrderDetail>("POST", C.ORDER_COD_CONFIRMATION(id)),
};

export const paymentsApi = {
  async page(params: QueryParams, signal?: AbortSignal): Promise<PaymentPage> {
    const res = await fetch(`${BROWSER_API_BASE_URL}${withQuery(C.PAYMENTS, { page: 1, ...params })}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
    const body = await json<{ data: OrderPayment[]; meta: PaymentPage["meta"] }>(res);
    return { items: body.data, meta: body.meta };
  },
  stats: () => request<PaymentStats>("GET", C.PAYMENT_STATS),
  setup: () => request<PaymentSetup>("GET", C.PAYMENT_SETUP),
  saveOptions: (body: Omit<PaymentOptions, "currency">) =>
    request<PaymentOptions>("PUT", C.PAYMENT_OPTIONS, body),
  saveGateway: (provider: GatewayName, body: GatewayInput) =>
    request<Gateway>("PUT", C.GATEWAY(provider), body),
  checkGateway: (provider: GatewayName) => request<Gateway>("POST", C.GATEWAY_CHECK(provider)),
  makeDefault: (provider: GatewayName) => request<Gateway>("POST", C.GATEWAY_DEFAULT(provider)),
  removeGateway: (provider: GatewayName) => request<null>("DELETE", C.GATEWAY(provider)),
  check: (id: number) => request<OrderPayment>("POST", C.PAYMENT_CHECK(id)),
  resend: (id: number) => request<OrderPayment>("POST", C.PAYMENT_RESEND(id)),
  cancel: (id: number) => request<OrderPayment>("POST", C.PAYMENT_CANCEL(id)),
};

export interface RecoveryStep {
  after: number;
  coupon_id: number | null;
  template_id: number | null;
}

export interface RecoverySettings {
  on: boolean;
  steps: RecoveryStep[];
}

export interface CartStats {
  started: number;
  waiting: number;
  reminded: number;
  recovered: number;
  rate: number | null;
  revenue_text: string;
  on: boolean;
  steps: { after: number; sent: number; recovered: number; revenue_text: string }[];
}

export interface Cart extends Order {
  recovery_steps: number;
  next_reminder_at: string | null;
  recovered_step: number | null;
}

export interface CartPage {
  items: Cart[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export const cartsApi = {
  async page(params: QueryParams, signal?: AbortSignal): Promise<CartPage> {
    const res = await fetch(`${BROWSER_API_BASE_URL}${withQuery(C.CARTS, { page: 1, ...params })}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
    const body = await json<{ data: Cart[]; meta: CartPage["meta"] }>(res);
    return { items: body.data, meta: body.meta };
  },
  stats: () => request<CartStats>("GET", C.CART_STATS),
  settings: () => request<RecoverySettings>("GET", C.CART_SETTINGS),
  saveSettings: (body: RecoverySettings) => request<RecoverySettings>("PUT", C.CART_SETTINGS, body),
  remind: (orderId: number) => request<OrderDetail>("POST", C.ORDER_REMIND(orderId)),
};

export const CARTS_QK = {
  ALL: ["carts"] as const,
  LIST: (params: QueryParams) => ["carts", "list", params] as const,
  STATS: ["carts", "stats"] as const,
  SETTINGS: ["carts", "settings"] as const,
};

export type StorePlatform = "shopify" | "woocommerce";

export interface StoreConnection {
  id: number;
  platform: StorePlatform;
  label: string;
  shop_url: string;
  name: string | null;
  status: "connected" | "error";
  last_error: string | null;
  import_orders: boolean;
  notify: boolean;
  abandoned: boolean;
  last_sync_at: string | null;
  last_event_at: string | null;
  products_synced: number;
  orders_synced: number;
  webhook_url: string;
  webhooks: number;
  saved_fields: string[];
}

export interface StorePlatformInfo {
  platform: StorePlatform;
  label: string;
  fields: { key: string; label: string; secret: boolean }[];
  store: StoreConnection | null;
}

export interface StoreInput {
  shop_url: string;
  credentials: Record<string, string>;
  import_orders: boolean;
  notify: boolean;
  abandoned: boolean;
}

export interface Insights {
  days: 7 | 30 | 90;
  currency: string;
  kpis: {
    revenue: number;
    revenue_text: string;
    revenue_change: number | null;
    orders: number;
    orders_change: number | null;
    aov_text: string | null;
    aov_change: number | null;
    items_sold: number;
    customers: number;
    returning: number;
    recovered_text: string;
    refunded_text: string;
    campaign_revenue_text: string;
  };
  series: { date: string; revenue: number; orders: number }[];
  by_source: { source: string; label: string; revenue: number; revenue_text: string; orders: number }[];
  by_payment: { method: string; label: string; revenue: number; revenue_text: string; orders: number }[];
  top_products: {
    product_id: number | null;
    name: string;
    quantity: number;
    revenue: number;
    revenue_text: string;
  }[];
  campaigns: {
    id: number;
    name: string;
    orders: number;
    revenue: number;
    revenue_text: string;
    sent: number;
    conversion: number | null;
  }[];
  chatbots: { id: number; name: string; orders: number; revenue: number; revenue_text: string }[];
  funnel: { step: string; label: string; count: number }[];
}

export const storesApi = {
  list: () => request<StorePlatformInfo[]>("GET", C.STORES),
  save: (platform: StorePlatform, body: StoreInput) =>
    request<StoreConnection>("PUT", C.STORE(platform), body),
  sync: (platform: StorePlatform) => request<StoreConnection>("POST", C.STORE_SYNC(platform)),
  remove: (platform: StorePlatform) => request<null>("DELETE", C.STORE(platform)),
  insights: (days: number) => request<Insights>("GET", `${C.INSIGHTS}?days=${days}`),
};

export const STORES_QK = {
  LIST: ["commerce", "stores"] as const,
  INSIGHTS: (days: number) => ["commerce", "insights", days] as const,
};

export const PAYMENTS_QK = {
  ALL: ["payments"] as const,
  LIST: (params: QueryParams) => ["payments", "list", params] as const,
  STATS: ["payments", "stats"] as const,
  SETUP: ["payments", "setup"] as const,
};

export const ORDERS_QK = {
  ALL: ["orders"] as const,
  LIST: (params: QueryParams) => ["orders", "list", params] as const,
  STATS: ["orders", "stats"] as const,
  ONE: (id: number) => ["orders", "one", id] as const,
  CONTACT: (id: number) => ["orders", "contact", id] as const,
  CHECKOUT: ["commerce", "checkout"] as const,
  COUPONS: ["commerce", "coupons"] as const,
};
