"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Input, Modal, Skeleton, Switch } from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, timeAgo } from "@/lib/utils";

import {
  COMMERCE_QK,
  ORDERS_QK,
  STORES_QK,
  storesApi,
  type StorePlatform,
  type StorePlatformInfo,
} from "../../../_lib/commerceApi";
import { Block } from "../CheckoutSettings";

const ABOUT: Record<StorePlatform, { blurb: string; tile: string; placeholder: string; steps: string[] }> = {
  shopify: {
    blurb: "Orders, abandoned checkouts and products from your Shopify store.",
    tile: "bg-[#5e8e3e] text-white",
    placeholder: "mystore.myshopify.com",
    steps: [
      "In Shopify admin, open Settings → Apps and sales channels → Develop apps, and create an app (e.g. “ChatDesk”).",
      "Under Configuration, give it read access to orders, products and checkouts, then install it.",
      "Copy the Admin API access token (shown once) and the API secret key, and paste them here.",
    ],
  },
  woocommerce: {
    blurb: "Orders and products from your WordPress store.",
    tile: "bg-[#7f54b3] text-white",
    placeholder: "https://www.myshop.com",
    steps: [
      "In WordPress, open WooCommerce → Settings → Advanced → REST API, and add a key with Read/Write access.",
      "Copy the consumer key and consumer secret, and paste them here with your store's address.",
      "ChatDesk adds the webhooks it needs to your store by itself.",
    ],
  },
};

function StoreModal({ info, onClose }: { info: StorePlatformInfo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const s = info.store;
  const about = ABOUT[info.platform];
  const [url, setUrl] = useState(s?.shop_url ?? "");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState({
    import_orders: s?.import_orders ?? true,
    notify: s?.notify ?? true,
    abandoned: s?.abandoned ?? true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: STORES_QK.LIST });
    await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
    await queryClient.invalidateQueries({ queryKey: ORDERS_QK.ALL });
  };
  const run = async (key: string, fn: () => Promise<{ message?: string }>, close = false) => {
    setBusy(key);
    setProblem("");
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      await refresh();
      if (close) onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) {
        setErrors(err.errors);
        setProblem(err.message);
      } else setProblem(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={s ? info.label : `Connect ${info.label}`}
      description={about.blurb}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {s && (
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft mr-auto"
              loading={busy === "remove"}
              onClick={() => {
                if (window.confirm(`Disconnect ${info.label}? Products and orders already imported stay.`))
                  void run("remove", () => storesApi.remove(info.platform), true);
              }}
            >
              Disconnect
            </Button>
          )}
          {s && (
            <Button
              variant="secondary"
              leftIcon={RefreshCw}
              loading={busy === "sync"}
              onClick={() => run("sync", () => storesApi.sync(info.platform))}
            >
              Import now
            </Button>
          )}
          <Button
            leftIcon={s ? undefined : Plug}
            loading={busy === "save"}
            onClick={() =>
              run(
                "save",
                () => storesApi.save(info.platform, { shop_url: url, credentials: creds, ...opts }),
                true
              )
            }
          >
            {s ? "Save" : "Connect"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {problem && (
          <p
            role="alert"
            className="border-danger/30 bg-danger-soft text-danger rounded-lg border px-3 py-2 text-sm"
          >
            {problem}
          </p>
        )}
        {s && (
          <div className="border-line bg-page/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <Badge tone={s.status === "connected" ? "success" : "danger"} dot>
              {s.status === "connected" ? "Connected" : "Needs attention"}
            </Badge>
            <span className="text-fg font-medium">{s.name}</span>
            <span className="text-fg-subtle text-xs">
              {s.products_synced} products · {s.orders_synced} orders
              {s.last_event_at ? ` · last heard from ${timeAgo(s.last_event_at)}` : ""}
            </span>
          </div>
        )}
        {s?.last_error && <p className="text-danger text-xs break-words">{s.last_error}</p>}
        {!s && (
          <ol className="text-fg-subtle list-decimal space-y-1.5 pl-5 text-sm">
            {about.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        <Input
          label="Store address"
          name="shop_url"
          placeholder={about.placeholder}
          value={url}
          error={errors.shop_url}
          onChange={(e) => {
            setUrl(e.target.value);
            setErrors({});
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {info.fields.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              name={`credentials.${f.key}`}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              placeholder={s?.saved_fields.includes(f.key) ? "Saved · leave empty to keep" : ""}
              value={creds[f.key] ?? ""}
              error={errors[`credentials.${f.key}`]}
              onChange={(e) => {
                setCreds((c) => ({ ...c, [f.key]: e.target.value }));
                setErrors({});
              }}
            />
          ))}
        </div>
        {errors.credentials && <p className="text-danger -mt-3 text-xs">{errors.credentials}</p>}
        <div className="divide-line border-line divide-y rounded-lg border">
          <div className="p-3">
            <Switch
              label="Bring in new orders"
              hint="Every new order shows up in Orders, linked to the customer's chat."
              checked={opts.import_orders}
              onChange={(import_orders) => setOpts((o) => ({ ...o, import_orders }))}
            />
          </div>
          <div className="p-3">
            <Switch
              label="Send WhatsApp order updates"
              hint="Confirmed, shipped (with tracking), delivered, cancelled: as set in Order updates below. Cash-on-delivery confirmation too, if it's on."
              checked={opts.notify}
              onChange={(notify) => setOpts((o) => ({ ...o, notify }))}
            />
          </div>
          {info.platform === "shopify" && (
            <div className="p-3">
              <Switch
                label="Remind abandoned checkouts"
                hint="Unfinished Shopify checkouts get your cart reminders, with a link back to the checkout."
                checked={opts.abandoned}
                onChange={(abandoned) => setOpts((o) => ({ ...o, abandoned }))}
              />
            </div>
          )}
        </div>
        <p className="text-fg-faint flex items-start gap-1.5 text-xs">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Keys are stored encrypted and never shown again. Products import when you connect; after that,
          changes arrive by themselves. Your store stays in charge of stock and shipping.
        </p>
      </div>
    </Modal>
  );
}

/** Commerce → Settings: connecting a Shopify or WooCommerce store. */
export function StoresBlock() {
  const [open, setOpen] = useState<StorePlatform | null>(null);
  const { data, error } = useQuery({
    queryKey: STORES_QK.LIST,
    queryFn: async () => (await storesApi.list()).data,
  });
  if (error) return null; // only owners and admins manage the store connection
  const current = data?.find((d) => d.platform === open) ?? null;
  return (
    <Block
      title="Your online store"
      description="Already sell on Shopify or WooCommerce? Bring its orders and products into ChatDesk."
      icon={Store}
      className="xl:col-span-2"
    >
      {!data ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((p) => (
            <li key={p.platform}>
              <button
                type="button"
                onClick={() => setOpen(p.platform)}
                aria-label={`${p.store ? "Manage" : "Connect"} ${p.label}`}
                className="border-line hover:border-line-strong hover:bg-hover flex h-full w-full items-start gap-3 rounded-xl border p-4 text-left transition"
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                    ABOUT[p.platform].tile
                  )}
                  aria-hidden
                >
                  {p.label.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-fg flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {p.label}
                    {p.store && (
                      <Badge tone={p.store.status === "connected" ? "success" : "danger"} dot>
                        {p.store.status === "connected" ? "Connected" : "Needs attention"}
                      </Badge>
                    )}
                  </span>
                  <span className="text-fg-subtle mt-0.5 block truncate text-xs">
                    {p.store
                      ? `${p.store.name ?? p.store.shop_url} · ${p.store.products_synced} products · ${p.store.orders_synced} orders`
                      : ABOUT[p.platform].blurb}
                  </span>
                  <span className="text-primary mt-2 block text-xs font-medium">
                    {p.store ? "Manage" : "Connect"} →
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && <StoreModal info={current} onClose={() => setOpen(null)} />}
    </Block>
  );
}
