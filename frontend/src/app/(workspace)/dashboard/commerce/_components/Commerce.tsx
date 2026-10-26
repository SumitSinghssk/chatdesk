"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  CircleCheck,
  Clock,
  CreditCard,
  EyeOff,
  IndianRupee,
  PackageCheck,
  PackageX,
  ShoppingBag,
  ShoppingCart,
  Store,
  Timer,
  Truck,
  Undo2,
} from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import { Button, Card, Tabs } from "@/app/admin/_components/ui/index";

import {
  CARTS_QK,
  cartsApi,
  COMMERCE_QK,
  commerceApi,
  ORDERS_QK,
  ordersApi,
  PAYMENTS_QK,
  paymentsApi,
} from "../../_lib/commerceApi";
import { CART_VIEWS, CartsTab, type CartView } from "./carts/CartsTab";
import { CollectionsTab } from "./CollectionsTab";
import { InsightsTab } from "./insights/InsightsTab";
import { CouponsTab } from "./CouponsTab";
import { OrdersTab } from "./orders/OrdersTab";
import { PaymentsTab } from "./payments/PaymentsTab";
import { ProductsTab } from "./ProductsTab";
import { StoreSettingsTab } from "./StoreSettingsTab";

type Tab = "orders" | "insights" | "payments" | "carts" | "products" | "collections" | "coupons" | "settings";
const TABS: Tab[] = [
  "orders",
  "insights",
  "payments",
  "carts",
  "products",
  "collections",
  "coupons",
  "settings",
];

export function Commerce() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : "orders";
  /** Opens a tab, optionally with one filter (other filters are dropped). */
  const go = (t: Tab, filter?: Record<string, string>) => {
    const next = new URLSearchParams();
    if (t !== "orders") next.set("tab", t);
    for (const [k, v] of Object.entries(filter ?? {})) if (v) next.set(k, v);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  // while Meta is processing a sync, check back so the badges turn green (or red) on their own
  const { data: stats } = useQuery({
    queryKey: COMMERCE_QK.STATS,
    queryFn: async () => (await commerceApi.stats()).data,
    refetchInterval: tab === "products" ? 15_000 : false,
  });
  const { data: orderStats } = useQuery({
    queryKey: ORDERS_QK.STATS,
    queryFn: async () => (await ordersApi.stats()).data,
    refetchInterval: tab === "orders" ? 20_000 : false,
  });
  const { data: payStats } = useQuery({
    queryKey: PAYMENTS_QK.STATS,
    queryFn: async () => (await paymentsApi.stats()).data,
    refetchInterval: tab === "payments" ? 20_000 : false,
  });
  const { data: cartStats } = useQuery({
    queryKey: CARTS_QK.STATS,
    queryFn: async () => (await cartsApi.stats()).data,
    refetchInterval: tab === "carts" ? 30_000 : false,
  });
  const rawView = params.get("view") as CartView | null;
  const cartView: CartView = rawView && CART_VIEWS.includes(rawView) ? rawView : "open";
  const { data: collections } = useQuery({
    queryKey: COMMERCE_QK.COLLECTIONS,
    queryFn: async () => (await commerceApi.collections()).data,
  });
  const status = params.get("status") ?? "";
  const productFilter = params.get("stock") ? null : status;

  return (
    <>
      <h1 className="sr-only">Commerce</h1>

      {stats && !stats.catalog_connected && tab === "products" && (
        <div className="border-primary/25 bg-primary-soft/60 mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
          <Store className="text-primary h-5 w-5 shrink-0" aria-hidden />
          <p className="text-fg min-w-0 flex-1">
            <span className="font-semibold">Connect your Meta catalog</span>{" "}
            <span className="text-fg-subtle">
              to send products as WhatsApp shopping messages with a cart. Photo cards work without it.
            </span>
          </p>
          <Button size="sm" onClick={() => go("settings")}>
            Connect catalog
          </Button>
        </div>
      )}

      {tab === "insights" ? null : tab === "products" ? (
        <KpiGrid cols={5}>
          <KpiTile
            icon={ShoppingBag}
            tone="green"
            label="Products"
            value={stats?.total}
            hint={stats ? `${stats.draft} draft${stats.draft === 1 ? "" : "s"}` : undefined}
            active={productFilter === ""}
            onClick={() => go("products")}
          />
          <KpiTile
            icon={CircleCheck}
            tone="blue"
            label="In the catalog"
            value={stats?.active}
            hint={
              stats?.catalog_connected
                ? `${stats.synced} item${stats.synced === 1 ? "" : "s"} on Meta`
                : "Shown to customers"
            }
            active={productFilter === "active"}
            onClick={() => go("products", { status: "active" })}
          />
          <KpiTile
            icon={EyeOff}
            tone="slate"
            label="Hidden"
            value={stats?.hidden}
            hint="Kept, not shown"
            active={productFilter === "hidden"}
            onClick={() => go("products", { status: "hidden" })}
          />
          <KpiTile
            icon={PackageX}
            tone={stats?.out_of_stock ? "amber" : "slate"}
            label="Out of stock"
            value={stats?.out_of_stock}
            hint={stats?.low_stock ? `${stats.low_stock} running low` : "All in stock"}
            active={params.get("stock") === "out"}
            onClick={() => go("products", { stock: "out" })}
          />
          <KpiTile
            icon={AlertTriangle}
            tone={stats?.sync_errors ? "red" : "slate"}
            label="Catalog issues"
            value={stats ? (stats.catalog_connected ? stats.sync_errors : "—") : undefined}
            hint={stats?.catalog_connected ? "Items Meta refused" : "No catalog connected"}
            onClick={() => go("settings")}
          />
        </KpiGrid>
      ) : tab === "carts" ? (
        <KpiGrid cols={4}>
          <KpiTile
            icon={ShoppingCart}
            tone={cartStats?.waiting ? "amber" : "slate"}
            label="Carts waiting"
            value={cartStats?.waiting}
            hint="Stopped during checkout"
            active={cartView === "open"}
            onClick={() => go("carts", { view: "open" })}
          />
          <KpiTile
            icon={BellRing}
            tone="blue"
            label="Reminded · 30 days"
            value={cartStats?.reminded}
            hint={
              cartStats
                ? `of ${cartStats.started} cart${cartStats.started === 1 ? "" : "s"} started`
                : undefined
            }
            onClick={() => go("carts", { view: "setup" })}
          />
          <KpiTile
            icon={PackageCheck}
            tone="green"
            label="Recovered"
            value={cartStats?.recovered}
            hint={cartStats?.rate == null ? "No reminders yet" : `${cartStats.rate}% of reminded carts`}
            active={cartView === "recovered"}
            onClick={() => go("carts", { view: "recovered" })}
          />
          <KpiTile
            icon={orderStats?.currency === "INR" ? IndianRupee : Banknote}
            tone="green"
            label="Revenue recovered"
            value={cartStats?.revenue_text}
            hint="Last 30 days"
          />
        </KpiGrid>
      ) : tab === "payments" ? (
        <KpiGrid cols={4}>
          <KpiTile
            icon={orderStats?.currency === "INR" ? IndianRupee : Banknote}
            tone="green"
            label="Collected · 30 days"
            value={payStats?.collected_text}
            hint={
              payStats
                ? `${payStats.paid_count} payment${payStats.paid_count === 1 ? "" : "s"} online`
                : undefined
            }
            active={params.get("status") === "paid"}
            onClick={() => go("payments", { view: "list", status: "paid" })}
          />
          <KpiTile
            icon={Timer}
            tone={payStats?.waiting ? "amber" : "slate"}
            label="Waiting to be paid"
            value={payStats?.waiting}
            hint={payStats?.waiting ? payStats.waiting_text : "No open links"}
            active={params.get("status") === "created"}
            onClick={() => go("payments", { view: "list", status: "created" })}
          />
          <KpiTile
            icon={CreditCard}
            tone="blue"
            label="Links paid"
            value={payStats ? (payStats.conversion === null ? "—" : `${payStats.conversion}%`) : undefined}
            hint="Of links sent in 30 days"
            onClick={() => go("payments", { view: "list" })}
          />
          <KpiTile
            icon={Undo2}
            tone="slate"
            label="Refunded · 30 days"
            value={payStats?.refunded_text}
            hint="Through gateways or by hand"
          />
        </KpiGrid>
      ) : (
        <KpiGrid cols={5}>
          <KpiTile
            icon={orderStats?.currency === "INR" ? IndianRupee : Banknote}
            tone="green"
            label="Sales · 30 days"
            value={orderStats?.revenue_30d_text}
            hint={
              orderStats
                ? `${orderStats.orders_30d} order${orderStats.orders_30d === 1 ? "" : "s"}${orderStats.average_text ? ` · avg ${orderStats.average_text}` : ""}`
                : undefined
            }
            active={tab === "orders" && status === ""}
            onClick={() => go("orders")}
          />
          <KpiTile
            icon={Clock}
            tone={orderStats?.checkout ? "amber" : "slate"}
            label="Waiting for customer"
            value={orderStats?.checkout}
            hint="Address or payment choice"
            active={tab === "orders" && status === "checkout"}
            onClick={() => go("orders", { status: "checkout" })}
          />
          <KpiTile
            icon={PackageCheck}
            tone={orderStats?.to_ship ? "blue" : "slate"}
            label="To ship"
            value={orderStats?.to_ship}
            hint="Confirmed or packed"
            active={tab === "orders" && status === "to_ship"}
            onClick={() => go("orders", { status: "to_ship" })}
          />
          <KpiTile
            icon={Truck}
            tone="purple"
            label="On the way"
            value={orderStats?.shipped}
            hint={orderStats ? `${orderStats.delivered} delivered` : undefined}
            active={tab === "orders" && status === "shipped"}
            onClick={() => go("orders", { status: "shipped" })}
          />
          <KpiTile
            icon={Banknote}
            tone={orderStats?.cod_due ? "amber" : "slate"}
            label="Cash to collect"
            value={orderStats?.cod_due ? orderStats.cod_due_text : orderStats ? "—" : undefined}
            hint={
              orderStats?.cod_due
                ? `${orderStats.cod_due} COD order${orderStats.cod_due === 1 ? "" : "s"}`
                : "No COD due"
            }
            active={tab === "orders" && params.get("payment") === "cod_due"}
            onClick={() => go("orders", { payment: "cod_due" })}
          />
        </KpiGrid>
      )}

      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs<Tab>
            value={tab}
            onChange={(t) => go(t)}
            tabs={[
              { value: "orders", label: "Orders", count: orderStats?.total },
              { value: "insights", label: "Insights" },
              { value: "payments", label: "Payments" },
              { value: "carts", label: "Carts", count: cartStats?.waiting || undefined },
              { value: "products", label: "Products", count: stats?.total },
              { value: "collections", label: "Collections", count: collections?.length },
              { value: "coupons", label: "Coupons" },
              { value: "settings", label: "Settings" },
            ]}
          />
        </div>
        {tab === "orders" && <OrdersTab />}
        {tab === "insights" && <InsightsTab />}
        {tab === "payments" && <PaymentsTab ready={payStats?.ready} />}
        {tab === "carts" && <CartsTab view={cartView} onView={(v) => go("carts", { view: v })} />}
        {tab === "products" && <ProductsTab collections={collections ?? []} />}
        {tab === "collections" && <CollectionsTab collections={collections} />}
        {tab === "coupons" && <CouponsTab />}
        {tab === "settings" && <StoreSettingsTab />}
      </Card>
    </>
  );
}
