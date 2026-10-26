"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Info, Search, SendHorizontal, ShoppingBag } from "lucide-react";

import { Button, EmptyState, Input, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

import { ProductBubble } from "../../_components/whatsapp/ProductBubble";
import { ChatBackdrop } from "../../_components/whatsapp/TemplatePreview";
import { COMMERCE_QK, commerceApi, type Product, type SendKind } from "../../_lib/commerceApi";
import { ProductThumb } from "../../commerce/_components/ProductsTab";
import { Segmented } from "../../templates/_components/editor/parts";
import { useBusinessName } from "../../templates/_components/useBusinessName";

const MAX_ITEMS = 30;
const KINDS: { value: SendKind; label: string; hint: string; catalog: boolean }[] = [
  {
    value: "product",
    label: "One product",
    hint: "A catalog card they can open and add to a cart.",
    catalog: true,
  },
  {
    value: "products",
    label: "Several",
    hint: `Up to ${MAX_ITEMS} products, in sections by collection.`,
    catalog: true,
  },
  { value: "catalog", label: "Whole catalog", hint: "A button that opens your full catalog.", catalog: true },
  {
    value: "card",
    label: "Photo card",
    hint: "Photo, price and Buy now / More details buttons. No catalog needed.",
    catalog: false,
  },
];

export interface SendProductsInput {
  kind: SendKind;
  product_ids?: number[];
  header?: string;
  body?: string;
  footer?: string;
}

export function ProductModal({
  open,
  contactName,
  onClose,
  onSend,
}: {
  open: boolean;
  contactName: string;
  onClose: () => void;
  onSend: (input: SendProductsInput) => Promise<boolean>;
}) {
  const business = useBusinessName();
  const [kind, setKind] = useState<SendKind | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Product[]>([]);
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const q = useDebouncedValue(search, 250);

  const { data: settings } = useQuery({
    queryKey: COMMERCE_QK.SETTINGS,
    queryFn: async () => (await commerceApi.settings()).data,
    enabled: open,
  });
  const hasCatalog = !!settings?.catalog;
  const current: SendKind = kind ?? (settings ? (hasCatalog ? "product" : "card") : "product");
  const kindInfo = KINDS.find((k) => k.value === current)!;
  const multi = current === "products";
  const { data, isLoading } = useQuery({
    queryKey: COMMERCE_QK.PRODUCTS({ search: q, per_page: 50, status: "active", picker: 1 }),
    queryFn: ({ signal }) => commerceApi.products({ search: q, per_page: 50, status: "active" }, signal),
    enabled: open && current !== "catalog",
    placeholderData: (prev) => prev,
  });

  const close = () => {
    setKind(null);
    setPicked([]);
    setSearch("");
    setHeader("");
    setBody("");
    onClose();
  };
  const toggle = (p: Product) => {
    if (!multi) return setPicked([p]);
    setPicked((prev) =>
      prev.some((x) => x.id === p.id)
        ? prev.filter((x) => x.id !== p.id)
        : prev.length >= MAX_ITEMS
          ? prev
          : [...prev, p]
    );
  };
  const choose = (k: SendKind) => {
    setKind(k);
    if (k !== "products") setPicked((prev) => prev.slice(0, 1));
  };

  const blockedByCatalog = kindInfo.catalog && !hasCatalog;
  const unsynced = kindInfo.catalog && picked.some((p) => p.sync_state !== "synced");
  const ready = !blockedByCatalog && !unsynced && (current === "catalog" || picked.length > 0) && !sending;

  const send = async () => {
    setSending(true);
    const ok = await onSend({
      kind: current,
      product_ids: current === "catalog" ? undefined : picked.map((p) => p.id),
      header: multi && header.trim() ? header.trim() : undefined,
      body: body.trim() || undefined,
    });
    setSending(false);
    if (ok) close();
  };

  const storeName = settings?.store_name || business;
  const bubbleProducts = picked.map((p) => ({
    name: p.name,
    price_text: p.price_text,
    compare_text: null,
    image_url: p.image_url,
  }));
  const cardBody = picked[0]
    ? [
        `*${picked[0].name}*`,
        `*${picked[0].price_text}*`,
        ...(picked[0].description ? ["", picked[0].description.slice(0, 300)] : []),
      ].join("\n")
    : "";

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Send products"
      description={`To ${contactName}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <p className="text-fg-subtle mr-auto text-xs">
            {current === "catalog"
              ? "Your whole catalog"
              : `${picked.length} selected${multi ? ` of ${MAX_ITEMS}` : ""}`}
          </p>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button leftIcon={SendHorizontal} loading={sending} disabled={!ready} onClick={send}>
            Send
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Segmented<SendKind>
            label="What to send"
            value={current}
            onChange={choose}
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
          <p className="text-fg-subtle -mt-2 text-xs">{kindInfo.hint}</p>

          {blockedByCatalog && (
            <div className="border-warning/30 bg-warning-soft text-fg flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm">
              <Info className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                This needs your Meta catalog.{" "}
                <Link
                  href={`${CUSTOMER_ROUTES.COMMERCE()}?tab=settings`}
                  className="text-primary font-medium hover:underline"
                >
                  Connect it in Commerce
                </Link>
                , or send a photo card.
              </p>
            </div>
          )}

          {current !== "catalog" && (
            <>
              <Input
                aria-label="Search products"
                name="product-search"
                leftIcon={Search}
                placeholder="Search name or SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div
                className="border-line max-h-80 overflow-y-auto rounded-xl border"
                role="listbox"
                aria-label="Products"
                aria-multiselectable={multi}
              >
                {isLoading ? (
                  <div className="space-y-2 p-3">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-12 rounded-lg" />
                    ))}
                  </div>
                ) : !data?.items.length ? (
                  <EmptyState
                    icon={ShoppingBag}
                    title={q ? "No products match" : "No products yet"}
                    description={q ? "Try another word." : "Add products in Commerce first."}
                    className="py-6"
                  />
                ) : (
                  <ul className="divide-line divide-y">
                    {data.items.map((p) => {
                      const on = picked.some((x) => x.id === p.id);
                      const notOnMeta = kindInfo.catalog && hasCatalog && p.sync_state !== "synced";
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={on}
                            onClick={() => toggle(p)}
                            className={cn(
                              "hover:bg-hover flex w-full items-center gap-3 px-3 py-2 text-left transition",
                              on && "bg-primary-soft/60"
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "flex h-4.5 w-4.5 shrink-0 items-center justify-center border",
                                multi ? "rounded" : "rounded-full",
                                on ? "border-primary bg-primary text-primary-fg" : "border-line-strong"
                              )}
                            >
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <ProductThumb src={p.image_url} />
                            <span className="min-w-0 flex-1">
                              <span className="text-fg block truncate text-sm font-medium">{p.name}</span>
                              <span className="text-fg-subtle block truncate text-xs">
                                {p.price_text}
                                {p.collection ? ` · ${p.collection.name}` : ""}
                                {p.out_of_stock ? " · Out of stock" : ""}
                              </span>
                            </span>
                            {notOnMeta && (
                              <span className="text-warning shrink-0 text-[11px] font-medium">
                                Not on Meta yet
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {unsynced && (
                <p className="text-warning text-xs">
                  Some picked products aren&apos;t in your Meta catalog yet. Wait a minute for the sync, or
                  send a photo card.
                </p>
              )}
            </>
          )}

          {multi && (
            <Input
              label="Title"
              name="list-header"
              maxLength={60}
              placeholder={storeName || "Our products"}
              value={header}
              onChange={(e) => setHeader(e.target.value)}
            />
          )}
          <Input
            label="Message (optional)"
            name="product-body"
            maxLength={1024}
            placeholder={
              current === "catalog"
                ? `Browse ${storeName || "our store"} and order right here on WhatsApp.`
                : current === "products"
                  ? "Tap a product to see the details and add it to your cart."
                  : "e.g. Here's the one you asked about"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <aside className="hidden lg:block" aria-label="Preview">
          <p className="text-fg-subtle mb-2 text-xs font-medium">Preview</p>
          <ChatBackdrop className="min-h-72">
            {current === "catalog" || picked.length ? (
              <ProductBubble
                kind={current}
                products={current === "catalog" ? bubbleProducts.slice(0, 1) : bubbleProducts}
                storeName={storeName}
                header={multi ? header || storeName : null}
                body={
                  current === "card"
                    ? (body ? `${body}\n\n` : "") + cardBody
                    : body ||
                      (current === "products"
                        ? "Tap a product to see the details and add it to your cart."
                        : current === "catalog"
                          ? `Browse ${storeName || "our store"} and order right here on WhatsApp.`
                          : null)
                }
              />
            ) : (
              <p className="text-fg-subtle py-16 text-center text-xs">Pick a product to see the message.</p>
            )}
          </ChatBackdrop>
        </aside>
      </div>
    </Modal>
  );
}
