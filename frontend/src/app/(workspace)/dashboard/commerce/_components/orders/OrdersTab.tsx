"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Plus, Receipt } from "lucide-react";

import { DataGrid, useGridUrlState, type GridColumn } from "@/app/admin/_components/grid";
import { Button, EmptyState, Pagination } from "@/app/admin/_components/ui/index";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { Tooltip } from "../../../_components/Tooltip";
import { ORDERS_QK, ordersApi, type Order } from "../../../_lib/commerceApi";
import { ORDER_STATUS, PaymentBadge, SOURCE_LABELS, StatusBadge } from "./labels";

const GRID_ID = "ws-orders";
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "checkout", label: "Waiting for customer" },
  { value: "to_ship", label: "To ship" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export function OrdersTab() {
  const router = useRouter();
  const list = useUrlListState({ filterKeys: ["status", "payment"] });
  const grid = useGridUrlState();
  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ORDERS_QK.LIST(params),
    queryFn: ({ signal }) => ordersApi.page(params, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 20_000,
  });
  const open = (o: Order) => router.push(CUSTOMER_ROUTES.COMMERCE_ORDER(o.id));
  const newOrder = () => router.push(CUSTOMER_ROUTES.COMMERCE_ORDER_NEW());
  const status = list.filters.status ?? "";

  const customer = (o: Order) => (
    <span className="block min-w-0">
      <span className="text-fg block truncate font-medium">{o.contact.name || o.contact.phone || "—"}</span>
      {o.contact.name && <span className="text-fg-subtle block truncate text-xs">{o.contact.phone}</span>}
    </span>
  );

  const columns: GridColumn<Order>[] = [
    {
      id: "number",
      header: "Order",
      type: "number",
      size: 130,
      alwaysVisible: true,
      cell: (o) => (
        <span className="block">
          <span className="text-fg block font-semibold tabular-nums">{o.ref}</span>
          <span className="text-fg-subtle block text-xs" title={formatDateTime(o.placed_at ?? o.created_at)}>
            {timeAgo(o.placed_at ?? o.created_at)}
          </span>
        </span>
      ),
    },
    { id: "customer", header: "Customer", sortable: false, size: 200, cell: customer },
    {
      id: "items",
      header: "Items",
      sortable: false,
      size: 260,
      cell: (o) => (
        <span className="text-fg-subtle block truncate text-sm" title={o.items_preview}>
          <span className="text-fg font-medium tabular-nums">{o.items_count}</span> · {o.items_preview}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      type: "number",
      size: 120,
      align: "right",
      cell: (o) => (
        <span className="text-fg font-semibold whitespace-nowrap tabular-nums">{o.total_text}</span>
      ),
    },
    {
      id: "payment_status",
      header: "Payment",
      sortable: false,
      size: 150,
      cell: (o) => <PaymentBadge order={o} />,
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 150,
      options: Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label })),
      cell: (o) => <StatusBadge status={o.status} />,
    },
    {
      id: "source",
      header: "From",
      type: "enum",
      size: 150,
      defaultHidden: true,
      options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
      cell: (o) => <span className="text-fg-subtle text-xs">{SOURCE_LABELS[o.source]}</span>,
    },
    {
      id: "chat",
      header: "",
      sortable: false,
      size: 60,
      minSize: 60,
      align: "right",
      alwaysVisible: true,
      cell: (o) =>
        o.contact.conversation_id ? (
          <Tooltip label="Open chat" align="end">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leftIcon={MessageCircle}
              aria-label={`Open the chat for ${o.ref}`}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`${CUSTOMER_ROUTES.INBOX()}?c=${o.contact.conversation_id}`);
              }}
              className="text-fg-faint hover:bg-primary-soft hover:text-primary"
            />
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <>
      <div
        className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-3 sm:px-5"
        role="tablist"
        aria-label="Order status"
      >
        {FILTERS.map((f) => {
          const on = status === f.value && !list.filters.payment;
          return (
            <button
              key={f.value || "all"}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => list.setFilters({ status: f.value, payment: "" })}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition",
                on
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-fg-subtle hover:border-line-strong hover:text-fg"
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <DataGrid
        id={GRID_ID}
        columns={columns}
        rows={data?.items}
        getRowId={(r) => r.id}
        loading={isLoading}
        fetching={isFetching}
        grid={grid}
        search={list.searchInput}
        onSearch={list.setSearchInput}
        searchPlaceholder="Order number, name, phone or tracking"
        count={data?.meta.total}
        countLabel={data?.meta.total === 1 ? "order" : "orders"}
        actions={
          <Tooltip label="New order" align="end">
            <Button iconOnly leftIcon={Plus} aria-label="New order" onClick={newOrder} className="h-9 w-9" />
          </Tooltip>
        }
        onRowClick={open}
        renderListItem={(o) => (
          <div className="flex items-center gap-3">
            <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <Receipt className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-fg flex items-center gap-2 text-sm font-semibold">
                {o.ref}
                <span className="text-fg-subtle truncate font-normal">
                  {o.contact.name || o.contact.phone}
                </span>
              </p>
              <p className="text-fg-subtle truncate text-xs">
                {o.total_text} · {o.items_count} item{o.items_count === 1 ? "" : "s"} ·{" "}
                {timeAgo(o.placed_at ?? o.created_at)}
              </p>
            </div>
            <span className="shrink-0">
              <StatusBadge status={o.status} />
            </span>
          </div>
        )}
        renderCard={(o) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-fg text-sm font-semibold">{o.ref}</p>
              <StatusBadge status={o.status} />
            </div>
            <p className="text-fg-subtle mt-1 truncate text-xs">{o.contact.name || o.contact.phone}</p>
            <p className="text-fg-subtle mt-2 line-clamp-2 min-h-8 text-xs">{o.items_preview}</p>
            <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-fg text-sm font-semibold">{o.total_text}</span>
              <PaymentBadge order={o} />
            </div>
          </>
        )}
        empty={
          <EmptyState
            icon={Receipt}
            title={list.hasFilters ? "No orders here" : "No orders yet"}
            description={
              list.hasFilters
                ? "Try another filter or search."
                : "Orders arrive when customers send a cart from your WhatsApp catalog or tap Buy now on a product you sent. You can also make one yourself."
            }
            action={
              !list.hasFilters && (
                <Button leftIcon={Plus} onClick={newOrder}>
                  New order
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
            unit="orders"
          />
        }
      />
    </>
  );
}
