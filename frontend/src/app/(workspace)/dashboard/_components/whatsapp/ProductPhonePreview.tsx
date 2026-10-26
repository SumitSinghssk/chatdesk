"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Minus,
  Plus,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { formatMoney, type ProductOption } from "../../_lib/commerceApi";
import { ProductBubble, type ProductBubbleKind } from "./ProductBubble";
import { PhonePreview } from "./TemplatePreview";
import { WaText } from "./WaText";

export interface PreviewVariant {
  values: Record<string, string>;
  price: number | null;
  sale: number | null;
  stock: number | null;
  image: string | null;
}

export interface PreviewItem {
  name: string;
  description: string;
  images: string[];
  options: ProductOption[];
  variants: PreviewVariant[];
  currency: string;
}

interface CartLine {
  key: string;
  label: string;
  unit: number;
  qty: number;
  image: string | null;
}

type ChatEntry = { from: "customer" | "business"; text: string } | { from: "cart"; lines: CartLine[] };

const GREEN = "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]";
const WHITE = "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]";
const MUTED = "text-[#667781] dark:text-[#8696a0]";

const unitPrice = (v: PreviewVariant | undefined) => (v ? (v.sale ?? v.price ?? 0) : 0);
const keyOf = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("|") || "default";

function Photo({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" className={cn("object-cover", className)} />
  ) : (
    <span
      className={cn(
        "flex items-center justify-center bg-[#f0f2f5] text-[#8696a0] dark:bg-[#2a3942]",
        className
      )}
    >
      <ImageIcon className="h-10 w-10" aria-hidden />
    </span>
  );
}

function Bubble({ from, children }: { from: "customer" | "business"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg px-2 py-1.5 text-[13.5px] leading-[1.4] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]",
        from === "customer" ? cn(GREEN, "self-end rounded-tr-none") : cn(WHITE, "self-start rounded-tl-none")
      )}
    >
      {children}
      <p className={cn("-mt-0.5 text-right text-[11px]", MUTED)}>10:25{from === "customer" && " ✓✓"}</p>
    </div>
  );
}

/**
 * A phone you can tap through like a customer: the message, the product page (photos, sizes and colours,
 * Add to cart), the cart, and sending it. Photo-card buttons show the reply that comes back.
 */
export function ProductPhonePreview({
  item,
  kind,
  businessName,
  storeName,
  cardBody,
}: {
  item: PreviewItem;
  kind: Extract<ProductBubbleKind, "product" | "card">;
  businessName: string;
  storeName?: string;
  cardBody?: string;
}) {
  const [screen, setScreen] = useState<"chat" | "product" | "cart">("chat");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [log, setLog] = useState<ChatEntry[]>([]);
  const end = useRef<HTMLSpanElement>(null);
  // new replies scroll the phone's chat (not the page) to the bottom
  useEffect(() => {
    const chat = end.current?.closest("[data-phone-chat]");
    if (chat && log.length) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }, [log.length]);

  const options = item.options.filter((o) => o.name && o.values.length);
  // the chosen values, falling back to the first variant's
  const first = item.variants[0];
  const chosen = Object.fromEntries(
    options.map((o) => [o.name, picked[o.name] ?? first?.values[o.name] ?? o.values[0]])
  );
  const variant = options.length
    ? item.variants.find((v) => options.every((o) => v.values[o.name] === chosen[o.name]))
    : first;
  const available = (name: string, value: string) =>
    item.variants.some(
      (v) =>
        v.values[name] === value &&
        options.every((o) => o.name === name || v.values[o.name] === chosen[o.name]) &&
        v.stock !== 0
    );
  const gallery = variant?.image
    ? [variant.image, ...item.images.filter((i) => i !== variant.image)]
    : item.images;
  const shownPhoto = gallery[Math.min(photo, gallery.length - 1)] ?? null;
  const label = options.length ? options.map((o) => chosen[o.name]).join(" / ") : "";
  const lineKey = keyOf(options.length ? chosen : {});
  const inCart = cart.find((l) => l.key === lineKey);
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const total = cart.reduce((n, l) => n + l.qty * l.unit, 0);
  const soldOut = !variant || variant.stock === 0;
  const money = (n: number | null | undefined) => formatMoney(n ?? 0, item.currency);
  const prices = item.variants.map(unitPrice);
  const fromPrice = prices.length ? Math.min(...prices) : 0;
  const varies = new Set(prices).size > 1;

  const setQty = (key: string, qty: number) =>
    setCart((c) =>
      qty <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty } : l))
    );
  const add = () => {
    if (soldOut) return;
    if (inCart) return setQty(lineKey, inCart.qty + 1);
    setCart((c) => [
      ...c,
      {
        key: lineKey,
        label: label ? `${item.name || "Product"} (${label})` : item.name || "Product",
        unit: unitPrice(variant),
        qty: 1,
        image: variant?.image ?? item.images[0] ?? null,
      },
    ]);
  };
  const reset = () => {
    setScreen("chat");
    setPicked({});
    setPhoto(0);
    setCart([]);
    setLog([]);
  };
  const tap = (action: string) => {
    if (action === "View") return setScreen("product");
    if (action === "Buy now") {
      setLog((l) => [
        ...l,
        { from: "customer", text: "Buy now" },
        {
          from: "business",
          text: `Great choice! 🛍️ *${item.name || "Your product"}*${label ? ` (${label})` : ""} for *${money(unitPrice(variant))}*.\nWe'll confirm your order and ask for your delivery address.`,
        },
      ]);
    }
    if (action === "More details") {
      setLog((l) => [
        ...l,
        { from: "customer", text: "More details" },
        {
          from: "business",
          text: [
            `*${item.name || "Product"}*`,
            varies ? `From *${money(fromPrice)}*` : `*${money(fromPrice)}*`,
            ...options.map((o) => `${o.name}: ${o.values.join(", ")}`),
            ...(item.description ? ["", item.description.slice(0, 500)] : []),
          ].join("\n"),
        },
      ]);
    }
  };
  const send = () => {
    setLog((l) => [
      ...l,
      { from: "cart", lines: cart },
      {
        from: "business",
        text: "Thanks! We got your order 🎉 We'll share the total and payment link shortly.",
      },
    ]);
    setCart([]);
    setScreen("chat");
  };

  const header = (title: string, onBack: () => void, right?: React.ReactNode) => (
    <div className="flex items-center gap-2 bg-[#008069] px-2 py-2.5 text-white dark:bg-[#202c33]">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="rounded-full p-0.5 hover:bg-white/15"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</span>
      {right}
    </div>
  );
  const cartButton = (
    <button
      type="button"
      onClick={() => setScreen("cart")}
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
      className="relative rounded-full p-1 hover:bg-white/15"
    >
      <ShoppingCart className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );

  const productScreen = (
    <div className={cn("flex min-h-0 flex-1 flex-col", WHITE)}>
      {header(storeName || businessName, () => setScreen("chat"), cartButton)}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative">
          <Photo src={shownPhoto} className="aspect-square w-full" />
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setPhoto((p) => (p - 1 + gallery.length) % gallery.length)}
                className="absolute top-1/2 left-1.5 -translate-y-1/2 rounded-full bg-white/80 p-1 text-slate-800 shadow"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setPhoto((p) => (p + 1) % gallery.length)}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full bg-white/80 p-1 text-slate-800 shadow"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {gallery.map((_, i) => (
                  <span
                    key={i}
                    className={cn("h-1.5 w-1.5 rounded-full", i === photo ? "bg-white" : "bg-white/50")}
                  />
                ))}
              </span>
            </>
          )}
        </div>
        <div className="space-y-3 px-3 py-3">
          <div>
            <p className="text-[16px] leading-snug font-semibold">{item.name || "Product name"}</p>
            <p className="mt-0.5 text-[15px]">
              <span className="font-semibold">{money(unitPrice(variant))}</span>
              {variant?.sale != null && (
                <span className={cn("ml-2 line-through", MUTED)}>{money(variant.price)}</span>
              )}
            </p>
            {soldOut && <p className="mt-1 text-[12px] font-medium text-[#ea0038]">Out of stock</p>}
            {variant?.stock != null && variant.stock > 0 && variant.stock <= 5 && (
              <p className="mt-1 text-[12px] font-medium text-[#c27b00]">Only {variant.stock} left</p>
            )}
          </div>
          {options.map((o) => (
            <div key={o.name}>
              <p className={cn("mb-1.5 text-[12px]", MUTED)}>
                {o.name}: <span className="font-medium text-current">{chosen[o.name]}</span>
              </p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={o.name}>
                {o.values.map((value) => {
                  const on = chosen[o.name] === value;
                  const ok = available(o.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setPicked((p) => ({ ...chosen, ...p, [o.name]: value }));
                        setPhoto(0);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12.5px] transition",
                        on
                          ? "border-[#008069] bg-[#008069]/10 font-semibold text-[#008069] dark:border-[#00a884] dark:text-[#00a884]"
                          : "border-black/15 dark:border-white/20",
                        !ok && "line-through opacity-45"
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {item.description && (
            <p className={cn("text-[13px] leading-relaxed whitespace-pre-wrap", MUTED)}>{item.description}</p>
          )}
        </div>
      </div>
      <div className="border-t border-black/10 p-2.5 dark:border-white/10">
        {inCart ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-black/15 dark:border-white/20">
              <button
                type="button"
                aria-label="One less"
                onClick={() => setQty(lineKey, inCart.qty - 1)}
                className="p-2"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center text-[14px] font-semibold tabular-nums">{inCart.qty}</span>
              <button type="button" aria-label="One more" onClick={add} className="p-2">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setScreen("cart")}
              className="flex-1 rounded-full bg-[#008069] py-2 text-[14px] font-semibold text-white dark:bg-[#00a884]"
            >
              View cart ({count})
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={add}
            disabled={soldOut}
            className="w-full rounded-full bg-[#008069] py-2 text-[14px] font-semibold text-white disabled:opacity-40 dark:bg-[#00a884]"
          >
            {soldOut ? "Out of stock" : "Add to cart"}
          </button>
        )}
      </div>
    </div>
  );

  const cartScreen = (
    <div className={cn("flex min-h-0 flex-1 flex-col", WHITE)}>
      {header("Your cart", () => setScreen("product"))}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <p className={cn("px-4 py-16 text-center text-[13px]", MUTED)}>Your cart is empty.</p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {cart.map((l) => (
              <li key={l.key} className="flex items-center gap-2.5 px-3 py-2.5">
                <Photo src={l.image} className="h-12 w-12 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{l.label}</p>
                  <p className={cn("text-[12px]", MUTED)}>{money(l.unit)}</p>
                </div>
                <div className="flex items-center rounded-full border border-black/15 dark:border-white/20">
                  <button
                    type="button"
                    aria-label={`One less ${l.label}`}
                    onClick={() => setQty(l.key, l.qty - 1)}
                    className="p-1.5"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-[13px] font-semibold tabular-nums">{l.qty}</span>
                  <button
                    type="button"
                    aria-label={`One more ${l.label}`}
                    onClick={() => setQty(l.key, l.qty + 1)}
                    className="p-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2 border-t border-black/10 p-3 dark:border-white/10">
        <div className="flex items-center justify-between text-[14px]">
          <span className={MUTED}>Estimated total</span>
          <span className="font-semibold">{money(total)}</span>
        </div>
        <button
          type="button"
          onClick={send}
          disabled={!cart.length}
          className="w-full rounded-full bg-[#008069] py-2 text-[14px] font-semibold text-white disabled:opacity-40 dark:bg-[#00a884]"
        >
          Send to business
        </button>
      </div>
    </div>
  );

  const bubbleProduct = {
    name: item.name || "Product name",
    price_text: varies ? `From ${money(fromPrice)}` : money(fromPrice),
    compare_text: !varies && first?.sale != null ? money(first.price) : null,
    image_url: item.images[0] ?? null,
  };

  return (
    <div className="space-y-2">
      <PhonePreview
        businessName={businessName}
        overlay={screen === "product" ? productScreen : screen === "cart" ? cartScreen : undefined}
        scrollChat
      >
        <ProductBubble
          kind={kind}
          products={[bubbleProduct]}
          storeName={storeName}
          body={kind === "card" ? cardBody : null}
          onAction={tap}
        />
        {log.map((entry, i) =>
          entry.from === "cart" ? (
            <div
              key={i}
              className={cn(
                "w-[75%] self-end overflow-hidden rounded-lg rounded-tr-none text-[13.5px] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]",
                GREEN
              )}
            >
              <div className="flex items-center gap-2 p-1.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-black/5 dark:bg-white/10">
                  <ShoppingCart className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {entry.lines.reduce((n, l) => n + l.qty, 0)} item
                    {entry.lines.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"}
                  </p>
                  <p className={cn("text-[12px]", MUTED)}>
                    {money(entry.lines.reduce((n, l) => n + l.qty * l.unit, 0))} (estimated total)
                  </p>
                </div>
              </div>
              <p className={cn("px-2 text-right text-[11px]", MUTED)}>10:26 ✓✓</p>
              <p className="border-t border-black/[0.07] py-2 text-center text-[13.5px] font-medium text-[#008069] dark:border-white/10 dark:text-[#53bdeb]">
                View sent cart
              </p>
            </div>
          ) : (
            <Bubble key={i} from={entry.from}>
              <p className="break-words whitespace-pre-wrap">
                <WaText text={entry.text} />
              </p>
            </Bubble>
          )
        )}
        <span ref={end} aria-hidden />
      </PhonePreview>
      <div className="flex items-center justify-center gap-3 text-xs">
        <span className="text-fg-subtle">
          {kind === "product" ? "Tap View to open the product." : "Tap the buttons to see the replies."}
        </span>
        {(log.length > 0 || screen !== "chat" || cart.length > 0) && (
          <button
            type="button"
            onClick={reset}
            className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Start over
          </button>
        )}
      </div>
    </div>
  );
}
