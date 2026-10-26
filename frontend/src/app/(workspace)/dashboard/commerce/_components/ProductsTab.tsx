"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  FolderInput,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingBag,
  SquarePen,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { DataGrid, useGridUrlState, type GridColumn } from "@/app/admin/_components/grid";
import {
  Badge,
  BulkActionBar,
  Button,
  Dropdown,
  EmptyState,
  Pagination,
  RowActions,
  Select,
  type BadgeTone,
} from "@/app/admin/_components/ui/index";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { Tooltip } from "../../_components/Tooltip";
import { COMMERCE_QK, commerceApi, type Collection, type Product } from "../../_lib/commerceApi";

const GRID_ID = "ws-products";
const muted = <span className="text-fg-faint">—</span>;
export const PRODUCT_STATUS: Record<Product["status"], { label: string; tone: BadgeTone; hint: string }> = {
  active: { label: "Active", tone: "success", hint: "Shown in your catalog" },
  hidden: { label: "Hidden", tone: "neutral", hint: "Kept, but customers can't see it" },
  draft: { label: "Draft", tone: "warning", hint: "Not finished; never sent to Meta" },
};

export function ProductThumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "bg-page border-line flex shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        className ?? "h-10 w-10"
      )}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ShoppingBag className="text-fg-faint h-4 w-4" aria-hidden />
      )}
    </span>
  );
}

export function SyncBadge({ product }: { product: Product }) {
  if (!product.sync_state) return muted;
  const s = {
    synced: {
      icon: CircleCheck,
      label: "On Meta",
      cls: "text-success",
      hint: "Live in your WhatsApp catalog",
    },
    pending: {
      icon: Loader2,
      label: "Syncing",
      cls: "text-fg-subtle",
      hint: "Meta is processing the change",
    },
    error: { icon: CircleAlert, label: "Refused", cls: "text-danger", hint: product.sync_errors.join(" · ") },
  }[product.sync_state];
  return (
    <Tooltip label={s.hint}>
      <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", s.cls)}>
        <s.icon
          className={cn("h-3.5 w-3.5", product.sync_state === "pending" && "animate-spin")}
          aria-hidden
        />
        {s.label}
      </span>
    </Tooltip>
  );
}

function stockText(p: Product) {
  if (p.out_of_stock) return <span className="text-danger text-xs font-medium">Out of stock</span>;
  if (p.stock === null) return <span className="text-fg-subtle text-xs">Not tracked</span>;
  return (
    <span className={cn("tabular", p.stock <= 5 ? "text-warning font-medium" : "text-fg")}>
      {p.stock} <span className="text-fg-subtle text-xs">in stock</span>
    </span>
  );
}

export function ProductsTab({ collections }: { collections: Collection[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useUrlListState({ filterKeys: ["status", "collection_id", "stock"] });
  const grid = useGridUrlState();
  const selection = useBulkSelection();

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: COMMERCE_QK.PRODUCTS(params),
    queryFn: ({ signal }) => commerceApi.products(params, signal),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.items.some((p) => p.sync_state === "pending") ? 10_000 : false),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: COMMERCE_QK.ALL });
  const open = (p: Product) => router.push(CUSTOMER_ROUTES.COMMERCE_PRODUCT(p.id));

  const remove = async (p: Product) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: "It's removed from your WhatsApp catalog too. Past orders keep their details.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await commerceApi.remove(p.id);
      toast.success("Product deleted");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const duplicate = async (p: Product) => {
    try {
      const res = await commerceApi.duplicate(p.id);
      toast.success(res.message ?? "Copy made");
      router.push(CUSTOMER_ROUTES.COMMERCE_PRODUCT(res.data.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const runBulk = async (
    action: "delete" | "activate" | "hide" | "collection" | "sync",
    collectionId?: number
  ) => {
    if (action === "delete") {
      const ok = await confirm({
        title: `Delete ${selection.count} product${selection.count === 1 ? "" : "s"}?`,
        message: "They're removed from your WhatsApp catalog too.",
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) return;
    }
    try {
      const res = await commerceApi.bulk(selection.ids, action, collectionId);
      toast.success(res.message ?? "Done");
      selection.clear();
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const rowActions = (p: Product) => (
    <RowActions onDelete={() => remove(p)}>
      <Tooltip label="Duplicate">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={Copy}
          aria-label={`Duplicate ${p.name}`}
          onClick={() => duplicate(p)}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
      <Tooltip label="Edit">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={SquarePen}
          aria-label={`Edit ${p.name}`}
          onClick={() => open(p)}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
    </RowActions>
  );

  const statusBadge = (p: Product) => (
    <Tooltip label={PRODUCT_STATUS[p.status].hint}>
      <Badge tone={PRODUCT_STATUS[p.status].tone} dot>
        {PRODUCT_STATUS[p.status].label}
      </Badge>
    </Tooltip>
  );
  const price = (p: Product) => (
    <span className="whitespace-nowrap">
      <span className="tabular text-fg font-medium">{p.price_text}</span>
      {p.on_sale && (
        <Badge tone="danger" className="ml-1.5">
          Sale
        </Badge>
      )}
    </span>
  );
  const sub = (p: Product) =>
    [p.collection?.name, p.variants.length > 1 ? `${p.variants.length} variants` : p.variants[0]?.retailer_id]
      .filter(Boolean)
      .join(" · ");

  const columns: GridColumn<Product>[] = [
    {
      id: "name",
      header: "Product",
      type: "text",
      size: 320,
      alwaysVisible: true,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-3">
          <ProductThumb src={p.image_url} />
          <span className="min-w-0">
            <span className="text-fg block truncate font-medium">{p.name}</span>
            <span className="text-fg-subtle block truncate text-xs">{sub(p) || "—"}</span>
          </span>
        </span>
      ),
    },
    { id: "price", header: "Price", sortable: false, size: 150, cell: price },
    { id: "stock", header: "Stock", sortable: false, size: 130, cell: stockText },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 110,
      options: Object.entries(PRODUCT_STATUS).map(([value, s]) => ({ value, label: s.label })),
      cell: statusBadge,
    },
    {
      id: "sync",
      header: "Catalog",
      sortable: false,
      size: 130,
      cell: (p) => <SyncBadge product={p} />,
    },
    {
      id: "updated_at",
      header: "Updated",
      type: "date",
      size: 120,
      cell: (p) => (
        <span title={formatDateTime(p.updated_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(p.updated_at)}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "Added",
      type: "date",
      size: 120,
      defaultHidden: true,
      cell: (p) => <span className="text-fg-subtle whitespace-nowrap">{timeAgo(p.created_at)}</span>,
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      size: 130,
      minSize: 130,
      alwaysVisible: true,
      align: "right",
      cell: rowActions,
    },
  ];

  const filtered = list.hasFilters || grid.filters.length > 0;
  const collectionOptions = [
    { value: "", label: "All collections" },
    ...collections.map((c) => ({ value: String(c.id), label: `${c.name} (${c.products})` })),
    { value: "0", label: "Not in a collection" },
  ];

  return (
    <>
      <DataGrid
        id={GRID_ID}
        columns={columns}
        rows={data?.items}
        getRowId={(r) => r.id}
        loading={isLoading}
        fetching={isFetching}
        grid={grid}
        selection={selection}
        search={list.searchInput}
        onSearch={list.setSearchInput}
        searchPlaceholder="Search name, brand or SKU"
        count={data?.meta.total}
        countLabel={data?.meta.total === 1 ? "product" : "products"}
        actions={
          <>
            {collections.length > 0 && (
              <Select
                aria-label="Collection"
                size="sm"
                value={list.filters.collection_id ?? ""}
                options={collectionOptions}
                onChange={(v) => list.setFilter("collection_id", v)}
                wrapperClassName="hidden w-44 sm:block"
              />
            )}
            <Tooltip label="New product" align="end">
              <Button
                iconOnly
                leftIcon={Plus}
                aria-label="New product"
                onClick={() => router.push(CUSTOMER_ROUTES.COMMERCE_PRODUCT_NEW())}
                className="h-9 w-9"
              />
            </Tooltip>
          </>
        }
        onRowClick={open}
        renderListItem={(p) => (
          <div className="flex items-center gap-3">
            <ProductThumb src={p.image_url} className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <p className="text-fg truncate text-sm font-semibold">{p.name}</p>
              <p className="text-fg-subtle truncate text-xs">
                {p.price_text}
                {sub(p) ? ` · ${sub(p)}` : ""}
              </p>
            </div>
            <span className="hidden shrink-0 sm:block">{statusBadge(p)}</span>
            <span className="shrink-0">{rowActions(p)}</span>
          </div>
        )}
        renderCard={(p) => (
          <>
            <ProductThumb src={p.image_url} className="aspect-square h-auto w-full rounded-lg" />
            <div className="mt-3 flex items-start justify-between gap-2">
              <p className="text-fg min-w-0 truncate text-sm font-semibold">{p.name}</p>
              {statusBadge(p)}
            </div>
            <p className="mt-1 text-sm">{price(p)}</p>
            <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs">{stockText(p)}</span>
              {rowActions(p)}
            </div>
          </>
        )}
        empty={
          <EmptyState
            icon={ShoppingBag}
            title={filtered ? "No products match" : "No products yet"}
            description={
              filtered
                ? "Try a different search or filter."
                : "Add what you sell with photos, prices and sizes. Then send it to customers in any chat, or let them browse your WhatsApp catalog."
            }
            action={
              !filtered && (
                <Button leftIcon={Plus} onClick={() => router.push(CUSTOMER_ROUTES.COMMERCE_PRODUCT_NEW())}>
                  Add your first product
                </Button>
              )
            }
          />
        }
        footer={
          <Pagination
            meta={data?.meta}
            onPageChange={list.setPage}
            onPerPageChange={list.setPerPage}
            unit="products"
          />
        }
      />

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button size="sm" variant="secondary" leftIcon={Eye} onClick={() => runBulk("activate")}>
          Show
        </Button>
        <Button size="sm" variant="secondary" leftIcon={EyeOff} onClick={() => runBulk("hide")}>
          Hide
        </Button>
        {collections.length > 0 && (
          <Dropdown
            align="right"
            width="w-56"
            trigger={() => (
              <Button size="sm" variant="secondary" leftIcon={FolderInput}>
                Move
              </Button>
            )}
            items={collections.map((c) => ({ label: c.name, onClick: () => runBulk("collection", c.id) }))}
          />
        )}
        <Button size="sm" variant="secondary" leftIcon={RefreshCw} onClick={() => runBulk("sync")}>
          Sync
        </Button>
        <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => runBulk("delete")}>
          Delete
        </Button>
      </BulkActionBar>
    </>
  );
}
