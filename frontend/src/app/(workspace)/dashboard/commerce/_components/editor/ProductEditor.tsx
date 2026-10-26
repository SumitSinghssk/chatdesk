"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  FileText,
  Image as ImageIcon,
  Layers,
  Plus,
  Save,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ErrorBanner,
  Input,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";

import type { ProductBubbleKind } from "../../../_components/whatsapp/ProductBubble";
import { ProductPhonePreview, type PreviewItem } from "../../../_components/whatsapp/ProductPhonePreview";
import {
  COMMERCE_QK,
  commerceApi,
  formatMoney,
  type Product,
  type ProductInput,
  type ProductOption,
} from "../../../_lib/commerceApi";
import { Counter, Section, Segmented } from "../../../templates/_components/editor/parts";
import { useBusinessName } from "../../../templates/_components/useBusinessName";
import { CollectionModal } from "../CollectionsTab";
import { PRODUCT_STATUS, SyncBadge } from "../ProductsTab";
import { PhotosField, type Photo } from "./PhotosField";
import { newKey, OptionsEditor, regenerate, VariantsTable, type VariantRow } from "./VariantsField";

interface Form {
  name: string;
  description: string;
  collection_id: string;
  brand: string;
  url: string;
  photos: Photo[];
  status: Product["status"];
  condition: Product["condition"];
  hasVariants: boolean;
  options: ProductOption[];
  rows: VariantRow[];
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function formOf(p: Product | null): Form {
  if (!p) {
    return {
      name: "",
      description: "",
      collection_id: "",
      brand: "",
      url: "",
      photos: [],
      status: "active",
      condition: "new",
      hasVariants: false,
      options: [],
      rows: [
        {
          key: newKey(),
          option_values: {},
          price: "",
          sale_price: "",
          retailer_id: "",
          stock: "",
          image: null,
        },
      ],
    };
  }
  return {
    name: p.name,
    description: p.description ?? "",
    collection_id: p.collection ? String(p.collection.id) : "",
    brand: p.brand ?? "",
    url: p.url ?? "",
    photos: p.images,
    status: p.status,
    condition: p.condition,
    hasVariants: p.options.length > 0,
    options: p.options,
    rows: p.variants.map((v) => ({
      key: `id${v.id}`,
      id: v.id,
      option_values: v.option_values,
      price: num(v.price),
      sale_price: num(v.sale_price),
      retailer_id: v.retailer_id,
      stock: num(v.stock),
      image: v.image,
    })),
  };
}

const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));

export function ProductEditor({ product }: { product: Product | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const business = useBusinessName();
  const [form, setForm] = useState<Form>(() => formOf(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [newCollection, setNewCollection] = useState(false);
  const [preview, setPreview] = useState<ProductBubbleKind>("product");

  const { data: settings } = useQuery({
    queryKey: COMMERCE_QK.SETTINGS,
    queryFn: async () => (await commerceApi.settings()).data,
  });
  const { data: collections } = useQuery({
    queryKey: COMMERCE_QK.COLLECTIONS,
    queryFn: async () => (await commerceApi.collections()).data,
  });
  const currency = settings?.currency ?? "INR";
  const patch = (changes: Partial<Form>) => {
    setForm((f) => ({ ...f, ...changes }));
    setErrors({});
    setProblem("");
  };
  const setOptions = (options: ProductOption[]) => patch({ options, rows: regenerate(options, form.rows) });
  const single = form.rows[0];
  const setSingle = (changes: Partial<VariantRow>) => patch({ rows: [{ ...single, ...changes }] });

  const body = (): ProductInput | null => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name the product";
    if (form.url && !/^https?:\/\/\S+$/.test(form.url.trim())) errs.url = "Start the link with https://";
    const options = form.hasVariants ? form.options.filter((o) => o.name.trim() && o.values.length) : [];
    if (form.hasVariants && !options.length) errs.options = "Add an option with at least one value";
    const rows = form.hasVariants ? form.rows : [form.rows[0]];
    rows.forEach((r, i) => {
      const price = parse(r.price);
      const sale = parse(r.sale_price);
      if (price === null || Number.isNaN(price) || price < 0) errs[`variants.${i}.price`] = "Enter a price";
      if (sale !== null && (Number.isNaN(sale) || (price !== null && sale >= price)))
        errs[`variants.${i}.sale_price`] = "Lower than the price";
    });
    if (Object.keys(errs).length) {
      setErrors(errs);
      setProblem(Object.keys(errs).some((k) => k.startsWith("variants")) ? "Check the prices." : "");
      return null;
    }
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      collection_id: form.collection_id ? Number(form.collection_id) : null,
      brand: form.brand.trim() || null,
      images: form.photos.map((p) => p.path),
      url: form.url.trim() || null,
      status: form.status,
      condition: form.condition,
      options: options.map((o) => ({ name: o.name.trim(), values: o.values })),
      variants: rows.map((r) => ({
        id: r.id,
        retailer_id: r.retailer_id.trim() || null,
        option_values: form.hasVariants ? r.option_values : {},
        price: parse(r.price) ?? 0,
        sale_price: parse(r.sale_price),
        stock: r.stock === "" ? null : Number(r.stock),
        image: r.image,
      })),
    };
  };

  const save = async (status?: Product["status"]) => {
    const input = body();
    if (!input) return;
    if (status) input.status = status;
    setSaving(true);
    try {
      const res = product ? await commerceApi.update(product.id, input) : await commerceApi.create(input);
      toast.success(res.message ?? "Saved");
      await queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
      if (!product) router.replace(CUSTOMER_ROUTES.COMMERCE_PRODUCT(res.data.id));
      else setForm(formOf(res.data));
    } catch (err) {
      if (err instanceof CustomerApiError) {
        setErrors(err.errors);
        setProblem(err.message);
      } else setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // preview: the cheapest variant
  const priced = form.rows
    .map((r) => ({ r, price: parse(r.price), sale: parse(r.sale_price) }))
    .filter((x) => x.price !== null && !Number.isNaN(x.price));
  const cheapest = priced.sort((a, b) => (a.sale ?? a.price!) - (b.sale ?? b.price!))[0];
  const priceText = cheapest
    ? formatMoney(cheapest.sale ?? cheapest.price!, currency)
    : formatMoney(0, currency);
  const compareText = cheapest?.sale !== null && cheapest ? formatMoney(cheapest.price!, currency) : null;
  const many = new Set(priced.map((x) => x.sale ?? x.price)).size > 1;
  const storeName = settings?.store_name || business;
  const photoUrl = (path: string | null) => form.photos.find((p) => p.path === path)?.url ?? null;
  const previewItem: PreviewItem = {
    name: form.name,
    description: form.description,
    images: form.photos.map((p) => p.url),
    options: form.hasVariants ? form.options.filter((o) => o.name.trim() && o.values.length) : [],
    variants: (form.hasVariants ? form.rows : [form.rows[0]]).map((r) => ({
      values: form.hasVariants ? r.option_values : {},
      price: parse(r.price),
      sale: parse(r.sale_price),
      stock: r.stock === "" ? null : Number(r.stock),
      image: photoUrl(r.image),
    })),
    currency,
  };
  const cardBody = [
    `*${form.name || "Product name"}*`,
    compareText ? `*${priceText}*  ~${compareText}~` : `*${many ? `From ${priceText}` : priceText}*`,
    ...(form.description ? ["", form.description.slice(0, 700)] : []),
  ].join("\n");

  const title = product ? product.name : "New product";
  const status = PRODUCT_STATUS[form.status];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={CUSTOMER_ROUTES.COMMERCE()}
          aria-label="Back to products"
          className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-fg flex items-center gap-2 truncate text-lg font-semibold">
            <span className="truncate">{title}</span>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </h1>
          <p className="text-fg-subtle truncate text-xs">
            {settings?.catalog
              ? "Saving updates your WhatsApp catalog too."
              : "Add photos, prices and sizes, then send it in any chat."}
          </p>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          {form.status !== "draft" && !product && (
            <Button variant="secondary" leftIcon={FileText} disabled={saving} onClick={() => save("draft")}>
              <span className="hidden sm:inline">Save as draft</span>
              <span className="sm:hidden">Draft</span>
            </Button>
          )}
          <Button leftIcon={Save} loading={saving} onClick={() => save()}>
            {product ? "Save" : "Add product"}
          </Button>
        </div>
      </div>

      {problem && <ErrorBanner className="mb-4" message={problem} />}
      {product?.sync_state === "error" && (
        <div className="border-danger/30 bg-danger-soft text-danger mb-4 flex gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Meta didn&apos;t accept this product</p>
            {product.sync_errors.map((e) => (
              <p key={e} className="opacity-90">
                {e}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Section title="Details" icon={Tag} hint="What customers see in WhatsApp.">
            <Input
              label="Name"
              name="name"
              required
              maxLength={200}
              value={form.name}
              error={errors.name}
              placeholder="e.g. Kaju Katli"
              onChange={(e) => patch({ name: e.target.value })}
            />
            <Textarea
              label="Description"
              name="description"
              rows={4}
              maxLength={5000}
              value={form.description}
              placeholder="Ingredients, size, what makes it special…"
              onChange={(e) => patch({ description: e.target.value })}
              hint={<Counter value={form.description} max={5000} />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Select
                  id="collection"
                  label="Collection"
                  value={form.collection_id}
                  options={[
                    { value: "", label: "No collection" },
                    ...(collections ?? []).map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                  onChange={(collection_id) => patch({ collection_id })}
                />
                <button
                  type="button"
                  onClick={() => setNewCollection(true)}
                  className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> New collection
                </button>
              </div>
              <Input
                label="Brand"
                name="brand"
                maxLength={100}
                value={form.brand}
                placeholder={storeName || "Your store name"}
                hint="Leave empty to use your store name."
                onChange={(e) => patch({ brand: e.target.value })}
              />
            </div>
          </Section>

          <Section
            title="Photos"
            icon={ImageIcon}
            hint="Meta needs at least one photo before the product shows in your catalog."
          >
            <PhotosField photos={form.photos} onChange={(photos) => patch({ photos })} />
          </Section>

          <Section title="Price and stock" icon={Layers} hint="Prices in your store currency.">
            <Switch
              label="This product has options like size or colour"
              hint="Each combination gets its own price, stock and SKU."
              checked={form.hasVariants}
              onChange={(hasVariants) =>
                patch(
                  hasVariants
                    ? {
                        hasVariants,
                        options: form.options.length ? form.options : [{ name: "Size", values: [] }],
                      }
                    : { hasVariants, rows: regenerate([], form.rows) }
                )
              }
            />
            {form.hasVariants ? (
              <>
                <OptionsEditor options={form.options} onChange={setOptions} />
                {errors.options && <p className="text-danger text-xs">{errors.options}</p>}
                {form.options.some((o) => o.values.length) && (
                  <VariantsTable
                    rows={form.rows}
                    onChange={(rows) => patch({ rows })}
                    photos={form.photos}
                    currency={currency}
                    errors={errors}
                  />
                )}
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={`Price (${currency})`}
                  name="price"
                  required
                  inputMode="decimal"
                  placeholder="0"
                  value={single.price}
                  error={errors["variants.0.price"]}
                  onChange={(e) => setSingle({ price: e.target.value })}
                />
                <Input
                  label="Sale price"
                  name="sale_price"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={single.sale_price}
                  error={errors["variants.0.sale_price"]}
                  hint="Shown with the price struck through."
                  onChange={(e) => setSingle({ sale_price: e.target.value })}
                />
                <Input
                  label="SKU"
                  name="sku"
                  maxLength={100}
                  placeholder="Made for you if empty"
                  value={single.retailer_id}
                  error={errors.variants}
                  hint="Your product code. It's the item ID in your Meta catalog."
                  onChange={(e) => setSingle({ retailer_id: e.target.value.replace(/\s/g, "") })}
                />
                <Input
                  label="Stock"
                  name="stock"
                  inputMode="numeric"
                  placeholder="Not tracked"
                  value={single.stock}
                  hint="Leave empty if you don't count it. 0 shows Out of stock."
                  onChange={(e) => setSingle({ stock: e.target.value.replace(/\D/g, "") })}
                />
              </div>
            )}
            {form.hasVariants && errors.variants && <p className="text-danger text-xs">{errors.variants}</p>}
          </Section>

          <Section title="Visibility and more" icon={Eye}>
            <RadioGroup<Product["status"]>
              label="Status"
              columns={3}
              value={form.status}
              onChange={(status) => patch({ status })}
              options={(Object.keys(PRODUCT_STATUS) as Product["status"][]).map((s) => ({
                value: s,
                label: PRODUCT_STATUS[s].label,
                description: PRODUCT_STATUS[s].hint,
              }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Product page link"
                name="url"
                type="url"
                maxLength={500}
                value={form.url}
                error={errors.url}
                placeholder="https://yourshop.com/kaju-katli"
                hint="Optional. Without it, ChatDesk makes a page with an Order on WhatsApp button."
                onChange={(e) => patch({ url: e.target.value })}
              />
              <Select
                id="condition"
                label="Condition"
                value={form.condition}
                options={[
                  { value: "new", label: "New" },
                  { value: "refurbished", label: "Refurbished" },
                  { value: "used", label: "Used" },
                ]}
                onChange={(condition) => patch({ condition: condition as Product["condition"] })}
              />
            </div>
          </Section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-0" aria-label="Preview">
          <Segmented<ProductBubbleKind>
            label="Preview as"
            value={preview}
            onChange={setPreview}
            options={[
              { value: "product", label: "Catalog product" },
              { value: "card", label: "Photo card" },
            ]}
          />
          <ProductPhonePreview
            key={preview}
            kind={preview === "card" ? "card" : "product"}
            item={previewItem}
            businessName={storeName || "Your business"}
            storeName={storeName}
            cardBody={cardBody}
          />
          {product && settings?.catalog && (
            <div className="border-line bg-surface flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm">
              <span className="text-fg-subtle">WhatsApp catalog</span>
              <SyncBadge product={product} />
            </div>
          )}
        </aside>
      </div>

      {newCollection && (
        <CollectionModal
          open
          onClose={() => setNewCollection(false)}
          onSaved={(c) => patch({ collection_id: String(c.id) })}
        />
      )}
    </>
  );
}
