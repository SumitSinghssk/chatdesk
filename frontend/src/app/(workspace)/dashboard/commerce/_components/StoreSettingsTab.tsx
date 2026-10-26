"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleCheck,
  Download,
  ExternalLink,
  Link2Off,
  RefreshCw,
  Settings2,
  Store,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  ErrorBanner,
  Input,
  Select,
  Skeleton,
  Switch,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { useBusinessName } from "../../templates/_components/useBusinessName";
import { CheckoutSettingsBlocks } from "./CheckoutSettings";
import { StoresBlock } from "./stores/StoresBlock";
import { COMMERCE_QK, CURRENCIES, commerceApi, type StoreSettings } from "../../_lib/commerceApi";

const COMMERCE_MANAGER = "https://business.facebook.com/commerce/";

function Block({
  title,
  description,
  icon: Icon,
  children,
  actions,
}: {
  title: string;
  description: string;
  icon: typeof Store;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="border-line rounded-xl border">
      <header className="border-line flex flex-wrap items-start gap-3 border-b px-4 py-3.5">
        <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-fg text-sm font-semibold">{title}</h2>
          <p className="text-fg-subtle text-xs">{description}</p>
        </div>
        {actions}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function StoreForm({ settings }: { settings: StoreSettings }) {
  const queryClient = useQueryClient();
  const business = useBusinessName();
  const [form, setForm] = useState({
    store_name: settings.store_name ?? "",
    currency: settings.currency,
    auto_sync: settings.auto_sync,
    cart_enabled: settings.cart_enabled,
    catalog_visible: settings.catalog_visible,
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    form.store_name !== (settings.store_name ?? "") ||
    form.currency !== settings.currency ||
    form.auto_sync !== settings.auto_sync ||
    form.cart_enabled !== settings.cart_enabled ||
    form.catalog_visible !== settings.catalog_visible;

  const save = async () => {
    setSaving(true);
    try {
      const res = await commerceApi.saveSettings({ ...form, store_name: form.store_name.trim() || null });
      toast.success(res.message ?? "Saved");
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Block
      title="Store"
      description="How your store appears to customers."
      icon={Settings2}
      actions={
        <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Store name"
          name="store_name"
          maxLength={120}
          value={form.store_name}
          placeholder={business || "Your business name"}
          hint="Shown as the brand on your products. Leave empty to use your business name."
          onChange={(e) => setForm({ ...form, store_name: e.target.value })}
        />
        <Select
          id="store-currency"
          label="Currency"
          value={form.currency}
          options={CURRENCIES}
          onChange={(currency) => setForm({ ...form, currency })}
          hint={settings.catalog ? "Changing it updates every price in your WhatsApp catalog." : undefined}
        />
      </div>
      {settings.catalog && (
        <div className="divide-line border-line divide-y rounded-lg border">
          <div className="p-3">
            <Switch
              label="Shopping cart on WhatsApp"
              hint="Customers add products to a cart and send it to you as an order."
              checked={form.cart_enabled}
              onChange={(cart_enabled) => setForm({ ...form, cart_enabled })}
            />
          </div>
          <div className="p-3">
            <Switch
              label="Catalog button in your chat"
              hint="The shop icon next to your name in WhatsApp opens your catalog."
              checked={form.catalog_visible}
              onChange={(catalog_visible) => setForm({ ...form, catalog_visible })}
            />
          </div>
          <div className="p-3">
            <Switch
              label="Sync product changes automatically"
              hint="Every add, edit or delete goes to your Meta catalog straight away."
              checked={form.auto_sync}
              onChange={(auto_sync) => setForm({ ...form, auto_sync })}
            />
          </div>
        </div>
      )}
    </Block>
  );
}

function ConnectCatalog() {
  const queryClient = useQueryClient();
  const [catalogId, setCatalogId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    data,
    error: loadError,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: COMMERCE_QK.CATALOGS,
    queryFn: async () => (await commerceApi.catalogs()).data,
    retry: false,
  });

  const connect = async (id: string) => {
    if (!/^\d{5,}$/.test(id.trim())) return setError("A catalog ID is a long number, e.g. 1234567890123456");
    setBusy(true);
    setError("");
    try {
      const res = await commerceApi.connect(id.trim());
      toast.success(res.message ?? "Catalog connected");
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
    } catch (err) {
      setError(err instanceof CustomerApiError ? (err.errors.catalog_id ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block
      title="WhatsApp catalog"
      description="Connect a Meta catalog to send native product messages and take orders with a cart."
      icon={Store}
      actions={<Badge tone="warning">Not connected</Badge>}
    >
      <ol className="text-fg-subtle grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["Create a catalog", "In Meta Commerce Manager, choose E-commerce and add a catalog."],
          ["Link it to WhatsApp", "In WhatsApp Manager → Catalog, choose the catalog for this number."],
          ["Connect it here", "Pick it below. We add your products and keep them in step."],
        ].map(([title, text], i) => (
          <li key={title} className="border-line bg-page/50 flex gap-3 rounded-lg border p-3">
            <span className="bg-primary text-primary-fg flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {i + 1}
            </span>
            <span>
              <span className="text-fg block font-medium">{title}</span>
              <span className="text-xs">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <a
        href={COMMERCE_MANAGER}
        target="_blank"
        rel="noreferrer"
        className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        Open Commerce Manager <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>

      {isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : loadError ? (
        <ErrorBanner message={errorMessage(loadError)} />
      ) : data?.catalogs.length ? (
        <div className="space-y-2">
          <p className="text-fg text-sm font-medium">Catalogs linked to your WhatsApp account</p>
          {data.catalogs.map((c) => (
            <div key={c.id} className="border-line flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Store className="text-fg-faint h-5 w-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-medium">{c.name}</p>
                <p className="text-fg-subtle text-xs">
                  ID {c.id}
                  {c.products !== null ? ` · ${c.products} item${c.products === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <Button size="sm" loading={busy} onClick={() => connect(c.id)}>
                Connect
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-fg-subtle flex items-center gap-2 text-sm">
          No catalog is linked to your WhatsApp account yet.
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden /> Check again
          </button>
        </p>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void connect(catalogId);
        }}
      >
        <Input
          label="Or enter a catalog ID"
          name="catalog_id"
          inputMode="numeric"
          value={catalogId}
          error={error}
          placeholder="e.g. 1234567890123456"
          onChange={(e) => {
            setCatalogId(e.target.value);
            setError("");
          }}
          wrapperClassName="min-w-0 flex-1 sm:max-w-sm"
        />
        <Button type="submit" variant="secondary" loading={busy} className="mb-[1px]">
          Connect
        </Button>
      </form>
    </Block>
  );
}

function ConnectedCatalog({ settings }: { settings: StoreSettings }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const catalog = settings.catalog!;
  const { data: stats } = useQuery({
    queryKey: COMMERCE_QK.STATS,
    queryFn: async () => (await commerceApi.stats()).data,
  });

  const run = async (key: string, fn: () => Promise<{ message?: string }>) => {
    setBusy(key);
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect the catalog?",
      message:
        "Customers won't see your catalog or cart on WhatsApp. Your products stay in ChatDesk and in the Meta catalog.",
      confirmLabel: "Disconnect",
      variant: "danger",
    });
    if (ok) await run("disconnect", commerceApi.disconnect);
  };

  return (
    <Block
      title="WhatsApp catalog"
      description="Your products are kept in this Meta catalog."
      icon={Store}
      actions={
        <Badge tone={settings.sync_error ? "danger" : "success"} dot>
          {settings.sync_error ? "Needs attention" : "Connected"}
        </Badge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border-line rounded-lg border p-3">
          <p className="text-fg-subtle text-xs">Catalog</p>
          <p className="text-fg truncate text-sm font-semibold">{catalog.name}</p>
          <p className="text-fg-faint truncate font-mono text-[11px]">{catalog.id}</p>
        </div>
        <div className="border-line rounded-lg border p-3">
          <p className="text-fg-subtle text-xs">Items on Meta</p>
          <p className="text-fg flex items-center gap-1.5 text-sm font-semibold">
            <CircleCheck className="text-success h-4 w-4" aria-hidden />
            {stats?.synced ?? "—"}
            {stats?.sync_errors ? (
              <span className="text-danger ml-2 inline-flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" aria-hidden /> {stats.sync_errors} refused
              </span>
            ) : null}
          </p>
        </div>
        <div className="border-line rounded-lg border p-3">
          <p className="text-fg-subtle text-xs">Last sync</p>
          <p className="text-fg text-sm font-semibold" title={formatDateTime(settings.last_sync_at)}>
            {settings.last_sync_at ? timeAgo(settings.last_sync_at) : "Not yet"}
          </p>
        </div>
      </div>
      {settings.sync_error && <ErrorBanner message={settings.sync_error} />}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          leftIcon={RefreshCw}
          loading={busy === "sync"}
          disabled={!!busy}
          onClick={() => run("sync", commerceApi.syncNow)}
        >
          Sync all products
        </Button>
        <Button
          variant="secondary"
          leftIcon={Download}
          loading={busy === "import"}
          disabled={!!busy}
          onClick={() => run("import", commerceApi.importCatalog)}
        >
          Import products from Meta
        </Button>
        <Button
          variant="ghost"
          leftIcon={Link2Off}
          loading={busy === "disconnect"}
          disabled={!!busy}
          onClick={disconnect}
          className="text-danger hover:bg-danger-soft sm:ml-auto"
        >
          Disconnect
        </Button>
      </div>
    </Block>
  );
}

export function StoreSettingsTab() {
  const { data: settings, error } = useQuery({
    queryKey: COMMERCE_QK.SETTINGS,
    queryFn: async () => (await commerceApi.settings()).data,
  });
  if (error) return <ErrorBanner className="m-5" message={errorMessage(error)} />;
  if (!settings) {
    return (
      <div className="space-y-4 p-4 sm:p-5">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }
  return (
    <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
      {settings.catalog ? <ConnectedCatalog settings={settings} /> : <ConnectCatalog />}
      <StoreForm key={JSON.stringify(settings)} settings={settings} />
      <StoresBlock />
      <CheckoutSettingsBlocks />
    </div>
  );
}
