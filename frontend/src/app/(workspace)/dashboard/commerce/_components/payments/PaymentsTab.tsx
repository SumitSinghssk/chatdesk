"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Copy, CreditCard, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type GridColumn } from "@/app/admin/_components/grid";
import { Button, EmptyState, Pagination } from "@/app/admin/_components/ui/index";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { Tooltip } from "../../../_components/Tooltip";
import { PAYMENTS_QK, paymentsApi, type OrderPayment } from "../../../_lib/commerceApi";
import { PayStatusBadge } from "../orders/labels";
import { PaymentSetup } from "./PaymentSetup";

const GRID_ID = "ws-payments";
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "created", label: "Waiting" },
  { value: "paid", label: "Paid" },
  { value: "expired", label: "Expired" },
  { value: "failed,cancelled", label: "Failed or cancelled" },
];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition",
        on
          ? "border-primary bg-primary-soft text-primary"
          : "border-line text-fg-subtle hover:border-line-strong hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

function PaymentList({ onSetup }: { onSetup: () => void }) {
  const router = useRouter();
  const list = useUrlListState({ filterKeys: ["status"] });
  const grid = useGridUrlState();
  const params = { ...list.params };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: PAYMENTS_QK.LIST(params),
    queryFn: ({ signal }) => paymentsApi.page(params, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 20_000,
  });
  const status = list.filters.status ?? "";
  const open = (p: OrderPayment) => p.order && router.push(CUSTOMER_ROUTES.COMMERCE_ORDER(p.order.id));
  const copyLink = async (p: OrderPayment) => {
    try {
      await navigator.clipboard.writeText(p.url!);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  const when = (p: OrderPayment) =>
    p.status === "paid" && p.paid_at
      ? `Paid ${timeAgo(p.paid_at)}`
      : p.status === "created" && p.expires_at
        ? `Until ${formatDateTime(p.expires_at)}`
        : timeAgo(p.created_at);

  const columns: GridColumn<OrderPayment>[] = [
    {
      id: "order",
      header: "Order",
      sortable: false,
      size: 200,
      alwaysVisible: true,
      cell: (p) => (
        <span className="block min-w-0">
          <span className="text-fg block font-semibold tabular-nums">{p.order?.ref}</span>
          <span className="text-fg-subtle block truncate text-xs">{p.order?.customer || "—"}</span>
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      sortable: false,
      size: 130,
      align: "right",
      cell: (p) => (
        <span className="block text-right">
          <span className="text-fg block font-semibold whitespace-nowrap tabular-nums">{p.amount_text}</span>
          {p.refunded_text && (
            <span className="text-fg-subtle block text-xs">{p.refunded_text} refunded</span>
          )}
        </span>
      ),
    },
    {
      id: "gateway",
      header: "Paid with",
      sortable: false,
      size: 170,
      cell: (p) => (
        <span className="block min-w-0">
          <span className="text-fg block truncate">{p.provider_label}</span>
          <span className="text-fg-subtle block truncate text-xs">
            {[p.method_label, p.purpose === "prepaid" ? "instead of COD" : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: false,
      size: 130,
      cell: (p) => <PayStatusBadge status={p.status} />,
    },
    {
      id: "when",
      header: "When",
      sortable: false,
      size: 190,
      cell: (p) => (
        <span className="text-fg-subtle text-xs" title={formatDateTime(p.created_at)}>
          {when(p)}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Reference",
      sortable: false,
      size: 200,
      defaultHidden: true,
      cell: (p) => (
        <span className="text-fg-subtle block truncate font-mono text-xs">
          {p.provider_payment_id || p.reference}
        </span>
      ),
    },
    {
      id: "copy",
      header: "",
      sortable: false,
      size: 60,
      minSize: 60,
      align: "right",
      alwaysVisible: true,
      cell: (p) =>
        p.status === "created" && p.url ? (
          <Tooltip label="Copy link" align="end">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leftIcon={Copy}
              aria-label={`Copy the payment link for ${p.order?.ref}`}
              onClick={(e) => {
                e.stopPropagation();
                void copyLink(p);
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
        aria-label="Payment status"
      >
        {FILTERS.map((f) => (
          <Pill
            key={f.value || "all"}
            on={status === f.value}
            onClick={() => list.setFilter("status", f.value)}
          >
            {f.label}
          </Pill>
        ))}
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
        searchPlaceholder="Order number, name, phone or payment id"
        count={data?.meta.total}
        countLabel={data?.meta.total === 1 ? "payment" : "payments"}
        actions={
          <Tooltip label="Payment setup" align="end">
            <Button
              iconOnly
              variant="secondary"
              leftIcon={Settings2}
              aria-label="Payment setup"
              onClick={onSetup}
              className="h-9 w-9"
            />
          </Tooltip>
        }
        onRowClick={open}
        renderListItem={(p) => (
          <div className="flex items-center gap-3">
            <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <CreditCard className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-fg flex items-center gap-2 text-sm font-semibold">
                {p.amount_text}
                <span className="text-fg-subtle truncate font-normal">
                  {p.order?.ref} · {p.order?.customer}
                </span>
              </p>
              <p className="text-fg-subtle truncate text-xs">
                {p.provider_label}
                {p.method_label ? ` · ${p.method_label}` : ""} · {when(p)}
              </p>
            </div>
            <span className="shrink-0">
              <PayStatusBadge status={p.status} />
            </span>
          </div>
        )}
        renderCard={(p) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-fg text-sm font-semibold">{p.amount_text}</p>
              <PayStatusBadge status={p.status} />
            </div>
            <p className="text-fg-subtle mt-1 truncate text-xs">
              {p.order?.ref} · {p.order?.customer}
            </p>
            <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs">
              <span className="text-fg-subtle">{p.provider_label}</span>
              <span className="text-fg-faint">{when(p)}</span>
            </div>
          </>
        )}
        empty={
          <EmptyState
            icon={CreditCard}
            title={list.hasFilters ? "No payments here" : "No payments yet"}
            description={
              list.hasFilters
                ? "Try another filter or search."
                : "When customers choose Pay online at checkout, or you send a payment link from an order, it shows up here."
            }
          />
        }
        footer={
          <Pagination
            meta={data?.meta}
            onPageChange={list.setPage}
            onPerPageChange={list.setPerPage}
            unit="payments"
          />
        }
      />
    </>
  );
}

/** Commerce → Payments: every payment link and its state, and the setup (gateways and options). */
export function PaymentsTab({ ready }: { ready: boolean | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("view");
  // until a gateway is connected there's nothing to list: start on the setup
  const view = raw === "setup" || raw === "list" ? raw : ready === false ? "setup" : "list";
  const show = useCallback(
    (v: "list" | "setup") => {
      const next = new URLSearchParams();
      next.set("tab", "payments");
      next.set("view", v);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname]
  );
  // pin that choice in the URL, so connecting the first gateway doesn't whisk the page away to the list
  useEffect(() => {
    if (!raw && ready === false) show("setup");
  }, [raw, ready, show]);
  return (
    <>
      <div
        className="border-line flex items-center gap-1.5 border-b px-4 py-2.5 sm:px-5"
        role="tablist"
        aria-label="Payments view"
      >
        <Pill on={view === "list"} onClick={() => show("list")}>
          Payments
        </Pill>
        <Pill on={view === "setup"} onClick={() => show("setup")}>
          Setup
        </Pill>
      </div>
      {view === "list" ? <PaymentList onSetup={() => show("setup")} /> : <PaymentSetup />}
    </>
  );
}
