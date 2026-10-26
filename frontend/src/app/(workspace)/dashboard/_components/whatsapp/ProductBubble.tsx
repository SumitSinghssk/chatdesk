"use client";

import { ImageIcon, LayoutGrid, ShoppingBag, ShoppingCart, Store } from "lucide-react";

import { cn } from "@/lib/utils";

import { WaText } from "./WaText";

export type ProductBubbleKind = "product" | "products" | "catalog" | "card";

export interface BubbleProduct {
  name: string;
  price_text: string;
  /** shown struck through next to a sale price */
  compare_text?: string | null;
  image_url: string | null;
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" className={cn("object-cover", className)} />
  ) : (
    <span
      className={cn(
        "flex items-center justify-center bg-[#f0f2f5] text-[#8696a0] dark:bg-[#2a3942]",
        className
      )}
    >
      <ImageIcon className="h-1/3 w-1/3" aria-hidden />
    </span>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ShoppingCart;
  label: string;
  onClick?: (label: string) => void;
}) {
  const cls =
    "flex w-full items-center justify-center gap-1.5 border-t border-black/[0.07] py-2 text-[13.5px] font-medium text-[#008069] dark:border-white/10 dark:text-[#53bdeb]";
  return onClick ? (
    <button
      type="button"
      onClick={() => onClick(label)}
      className={cn(cls, "hover:bg-black/[0.03] dark:hover:bg-white/5")}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  ) : (
    <div className={cls}>
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </div>
  );
}

/** A product message as the customer sees it in WhatsApp (single product, list, catalog or photo card). */
export function ProductBubble({
  kind,
  products,
  header,
  body,
  footer,
  storeName,
  time = "10:24",
  incoming = true,
  className,
  onAction,
}: {
  kind: ProductBubbleKind;
  products: BubbleProduct[];
  header?: string | null;
  body?: string | null;
  footer?: string | null;
  storeName?: string;
  time?: string;
  /** false: drawn as a sent (green) bubble, e.g. in the team inbox */
  incoming?: boolean;
  className?: string;
  /** makes the buttons tappable (interactive previews) */
  onAction?: (label: string) => void;
}) {
  const first = products[0];
  const tone = incoming
    ? "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"
    : "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]";
  const stamp = <p className="-mt-0.5 text-right text-[11px] text-[#667781] dark:text-[#8696a0]">{time}</p>;
  const price = (p: BubbleProduct) => (
    <span className="text-[12.5px]">
      <span className="font-semibold">{p.price_text}</span>
      {p.compare_text && <span className="ml-1.5 text-[#667781] line-through">{p.compare_text}</span>}
    </span>
  );

  return (
    <div
      className={cn(
        "w-full max-w-[290px] overflow-hidden rounded-lg text-[13.5px] leading-[1.4] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]",
        tone,
        className
      )}
    >
      {kind === "product" && first && (
        <>
          <div className="p-1">
            <div className="overflow-hidden rounded-md bg-black/[0.03] dark:bg-white/5">
              <Thumb src={first.image_url} className="aspect-square w-full" />
              <div className="px-2.5 py-2">
                <p className="truncate font-semibold">{first.name || "Product name"}</p>
                {price(first)}
                {storeName && <p className="truncate text-[11.5px] text-[#667781]">{storeName}</p>}
              </div>
            </div>
          </div>
          <div className="px-2 pb-1">
            {body && (
              <p className="break-words whitespace-pre-wrap">
                <WaText text={body} />
              </p>
            )}
            {footer && <p className="text-[12px] text-[#667781]">{footer}</p>}
            {stamp}
          </div>
          <ActionRow icon={ShoppingBag} label="View" onClick={onAction} />
        </>
      )}

      {kind === "products" && (
        <>
          <div className="flex gap-2 p-1">
            <div className="grid h-16 w-16 shrink-0 grid-cols-2 gap-px overflow-hidden rounded-md">
              {Array.from({ length: 4 }, (_, i) => (
                <Thumb key={i} src={products[i]?.image_url ?? null} className="h-full w-full" />
              ))}
            </div>
            <div className="min-w-0 py-1 pr-1">
              <p className="truncate font-bold">{header || storeName || "Products"}</p>
              <p className="text-[12px] text-[#667781]">
                {products.length} item{products.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="px-2 pb-1">
            {body && (
              <p className="break-words whitespace-pre-wrap">
                <WaText text={body} />
              </p>
            )}
            {footer && <p className="text-[12px] text-[#667781]">{footer}</p>}
            {stamp}
          </div>
          <ActionRow icon={LayoutGrid} label="View items" onClick={onAction} />
        </>
      )}

      {kind === "catalog" && (
        <>
          <div className="flex items-center gap-2 p-1">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#f0f2f5] dark:bg-[#2a3942]">
              {first?.image_url ? (
                <Thumb src={first.image_url} className="h-full w-full" />
              ) : (
                <Store className="h-6 w-6 text-[#8696a0]" aria-hidden />
              )}
            </span>
            <div className="min-w-0 py-1 pr-1">
              <p className="truncate font-bold">View {storeName ? `${storeName}'s` : "our"} catalog</p>
              <p className="text-[12px] text-[#667781]">Browse items and add them to your cart</p>
            </div>
          </div>
          <div className="px-2 pb-1">
            {body && (
              <p className="break-words whitespace-pre-wrap">
                <WaText text={body} />
              </p>
            )}
            {footer && <p className="text-[12px] text-[#667781]">{footer}</p>}
            {stamp}
          </div>
          <ActionRow icon={Store} label="View catalog" onClick={onAction} />
        </>
      )}

      {kind === "card" && first && (
        <>
          <div className="p-1">
            <Thumb src={first.image_url} className="aspect-[1.91/1] w-full rounded-md" />
          </div>
          <div className="px-2 pb-1">
            <p className="break-words whitespace-pre-wrap">
              <WaText text={body || `*${first.name}*\n*${first.price_text}*`} />
            </p>
            {footer && <p className="text-[12px] text-[#667781]">{footer}</p>}
            {stamp}
          </div>
          <ActionRow icon={ShoppingCart} label="Buy now" onClick={onAction} />
          <ActionRow icon={ShoppingBag} label="More details" onClick={onAction} />
        </>
      )}
    </div>
  );
}
