"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";

import { Button, Input, Select } from "@/app/admin/_components/ui/index";
import { cn } from "@/lib/utils";

import { TagInput } from "../../../_components/TagInput";
import type { ProductOption } from "../../../_lib/commerceApi";
import type { Photo } from "./PhotosField";

export interface VariantRow {
  key: string;
  id?: number;
  option_values: Record<string, string>;
  price: string;
  sale_price: string;
  retailer_id: string;
  stock: string; // "" = not tracked
  image: string | null;
}

export const MAX_OPTIONS = 3;
const PRESETS = ["Size", "Colour", "Weight", "Flavour", "Material", "Pack"];

export const rowKey = (values: Record<string, string>, options: ProductOption[]) =>
  options.map((o) => values[o.name] ?? "").join("\u0001") || "default";

let seq = 0;
export const newKey = () => `v${++seq}`;

/** Every combination of the option values, keeping rows (price, SKU, stock) that already exist. */
export function regenerate(options: ProductOption[], rows: VariantRow[]): VariantRow[] {
  const used = options.filter((o) => o.name.trim() && o.values.length);
  if (!used.length) {
    const first = rows[0];
    return [
      first
        ? { ...first, option_values: {} }
        : {
            key: newKey(),
            option_values: {},
            price: "",
            sale_price: "",
            retailer_id: "",
            stock: "",
            image: null,
          },
    ];
  }
  let combos: Record<string, string>[] = [{}];
  for (const o of used) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v })));
  const byKey = new Map(rows.map((r) => [rowKey(r.option_values, used), r]));
  const template = rows[0];
  return combos.map((values) => {
    const existing = byKey.get(rowKey(values, used));
    if (existing) return { ...existing, option_values: values };
    // a new combination: start from the same price, a fresh SKU
    return {
      key: newKey(),
      option_values: values,
      price: template?.price ?? "",
      sale_price: template?.sale_price ?? "",
      retailer_id: "",
      stock: template?.stock ?? "",
      image: null,
    };
  });
}

export function OptionsEditor({
  options,
  onChange,
}: {
  options: ProductOption[];
  onChange: (options: ProductOption[]) => void;
}) {
  const set = (i: number, patch: Partial<ProductOption>) =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const taken = new Set(options.map((o) => o.name.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      {options.map((o, i) => (
        <div
          key={i}
          className="border-line bg-page/40 grid gap-3 rounded-xl border p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start"
        >
          <Input
            label="Option"
            name={`option-${i}-name`}
            value={o.name}
            maxLength={30}
            placeholder="e.g. Size"
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <div>
            <TagInput
              id={`option-${i}-values`}
              label="Values"
              value={o.values}
              onChange={(values) => set(i, { values })}
              placeholder="Type a value and press Enter, e.g. 250 g"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            leftIcon={Trash2}
            aria-label={`Remove the ${o.name || "option"} option`}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="text-fg-faint hover:text-danger hover:bg-danger-soft sm:mt-6"
          />
        </div>
      ))}
      {options.length < MAX_OPTIONS && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={Plus}
            onClick={() => onChange([...options, { name: "", values: [] }])}
          >
            {options.length ? "Add another option" : "Add options like size or colour"}
          </Button>
          {PRESETS.filter((p) => !taken.has(p.toLowerCase()))
            .slice(0, 4)
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange([...options, { name: p, values: [] }])}
                className="border-line text-fg-subtle hover:border-primary hover:text-primary rounded-full border px-2.5 py-1 text-xs transition"
              >
                + {p}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

const GRID =
  "sm:grid-cols-[minmax(4.5rem,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.75fr)_minmax(0,1.25fr)] sm:items-center";

/** A field in a variant row; its label only shows on phones (the header row labels it on bigger screens). */
function Cell({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2 sm:col-span-1")}>
      <span className="text-fg-subtle mb-1 block text-[11px] sm:hidden" aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Price, sale price, SKU, stock and photo for every variant. */
export function VariantsTable({
  rows,
  onChange,
  photos,
  currency,
  errors,
}: {
  rows: VariantRow[];
  onChange: (rows: VariantRow[]) => void;
  photos: Photo[];
  currency: string;
  errors: Record<string, string>;
}) {
  const [all, setAll] = useState({ price: "", sale_price: "", stock: "" });
  const set = (key: string, patch: Partial<VariantRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const apply = () => {
    onChange(
      rows.map((r) => ({
        ...r,
        price: all.price || r.price,
        sale_price: all.sale_price || r.sale_price,
        stock: all.stock || r.stock,
      }))
    );
    setAll({ price: "", sale_price: "", stock: "" });
  };
  const photoOptions = [
    { value: "", label: "Main photo" },
    ...photos.map((p, i) => ({ value: p.path, label: i === 0 ? "Photo 1 (main)" : `Photo ${i + 1}` })),
  ];
  const label = (r: VariantRow) => Object.values(r.option_values).join(" / ");

  return (
    <div className="space-y-3">
      <div className="border-line bg-page/40 flex flex-wrap items-end gap-2 rounded-xl border p-3">
        <p className="text-fg w-full text-xs font-medium">Set for all {rows.length} variants</p>
        <Input
          aria-label="Price for all"
          name="all-price"
          inputMode="decimal"
          placeholder={`Price (${currency})`}
          value={all.price}
          onChange={(e) => setAll({ ...all, price: e.target.value })}
          wrapperClassName="w-32"
        />
        <Input
          aria-label="Sale price for all"
          name="all-sale"
          inputMode="decimal"
          placeholder="Sale price"
          value={all.sale_price}
          onChange={(e) => setAll({ ...all, sale_price: e.target.value })}
          wrapperClassName="w-32"
        />
        <Input
          aria-label="Stock for all"
          name="all-stock"
          inputMode="numeric"
          placeholder="Stock"
          value={all.stock}
          onChange={(e) => setAll({ ...all, stock: e.target.value })}
          wrapperClassName="w-24"
        />
        <Button
          size="sm"
          variant="secondary"
          leftIcon={Wand2}
          disabled={!all.price && !all.sale_price && !all.stock}
          onClick={apply}
          className="mb-[3px]"
        >
          Apply
        </Button>
      </div>

      {/* one row per variant: a card on phones, a table row from tablets up */}
      <div
        className="border-line divide-line divide-y overflow-hidden rounded-xl border"
        role="list"
        aria-label="Variants"
      >
        <div
          className={cn(GRID, "bg-page text-fg-subtle hidden px-3 py-2 text-xs font-medium sm:grid")}
          aria-hidden
        >
          <span>Variant</span>
          <span>Price ({currency})</span>
          <span>Sale price</span>
          <span>SKU</span>
          <span>Stock</span>
          <span>Photo</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.key}
            role="listitem"
            className={cn(
              GRID,
              "grid grid-cols-2 gap-x-2 gap-y-2 px-3 py-3 sm:py-2",
              i % 2 === 1 && "bg-page/30"
            )}
          >
            <span className="text-fg col-span-2 text-sm font-medium sm:col-span-1 sm:truncate">
              {label(r)}
            </span>
            <Cell label={`Price (${currency})`}>
              <Input
                aria-label={`Price of ${label(r)}`}
                name={`v-${r.key}-price`}
                inputMode="decimal"
                placeholder="0"
                value={r.price}
                error={errors[`variants.${i}.price`]}
                onChange={(e) => set(r.key, { price: e.target.value })}
              />
            </Cell>
            <Cell label="Sale price">
              <Input
                aria-label={`Sale price of ${label(r)}`}
                name={`v-${r.key}-sale`}
                inputMode="decimal"
                placeholder="—"
                value={r.sale_price}
                error={errors[`variants.${i}.sale_price`]}
                onChange={(e) => set(r.key, { sale_price: e.target.value })}
              />
            </Cell>
            <Cell label="SKU">
              <Input
                aria-label={`SKU of ${label(r)}`}
                name={`v-${r.key}-sku`}
                placeholder="Auto"
                value={r.retailer_id}
                maxLength={100}
                error={errors[`variants.${i}.retailer_id`]}
                onChange={(e) => set(r.key, { retailer_id: e.target.value.replace(/\s/g, "") })}
              />
            </Cell>
            <Cell label="Stock">
              <Input
                aria-label={`Stock of ${label(r)}`}
                name={`v-${r.key}-stock`}
                inputMode="numeric"
                placeholder="∞"
                value={r.stock}
                onChange={(e) => set(r.key, { stock: e.target.value.replace(/\D/g, "") })}
              />
            </Cell>
            <Cell label="Photo" wide>
              <Select
                aria-label={`Photo of ${label(r)}`}
                size="sm"
                value={r.image ?? ""}
                options={photoOptions}
                disabled={photos.length < 2}
                onChange={(v) => set(r.key, { image: v || null })}
              />
            </Cell>
          </div>
        ))}
      </div>
      <p className="text-fg-faint text-xs">
        Leave stock empty if you don&apos;t track it. SKUs are made for you when empty.
      </p>
    </div>
  );
}
