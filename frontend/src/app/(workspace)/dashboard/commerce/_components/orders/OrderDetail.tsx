"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  BellRing,
  Check,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package,
  PackageCheck,
  Pencil,
  Send,
  ShoppingBag,
  StickyNote,
  Truck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dropdown,
  ErrorBanner,
  Input,
  Modal,
  Spinner,
  Switch,
  Textarea,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import {
  cartsApi,
  ORDERS_QK,
  ordersApi,
  type Address,
  type OrderAction,
  type OrderDetail as Detail,
  type OrderEvent,
} from "../../../_lib/commerceApi";
import { ProductThumb } from "../ProductsTab";
import { ACTION_LABELS, PaymentBadge, SOURCE_LABELS, StatusBadge } from "./labels";
import { PaymentCard } from "./PaymentCard";
import {
  AddressFields,
  cleanAddress,
  EMPTY_ADDRESS,
  ItemsEditor,
  toInput,
  TotalsList,
  type ItemRow,
} from "./parts";

const STEPS = [
  { key: "placed", label: "Placed", icon: ShoppingBag },
  { key: "confirmed", label: "Confirmed", icon: Check },
  { key: "packed", label: "Packed", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: PackageCheck },
] as const;

const EVENT_ICONS: Record<OrderEvent["kind"], typeof Check> = {
  placed: ShoppingBag,
  status: ClipboardList,
  address: MapPin,
  message: MessageCircle,
  note: StickyNote,
  payment: CircleDollarSign,
  edit: Pencil,
};

function Steps({ order }: { order: Detail }) {
  if (order.status === "cancelled") {
    return (
      <div className="border-line bg-page/50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
        <Ban className="text-fg-subtle h-4 w-4" aria-hidden />
        <span className="text-fg font-medium">Cancelled</span>
        <span className="text-fg-subtle">
          {order.times.cancelled ? timeAgo(order.times.cancelled) : ""}
          {order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
        </span>
      </div>
    );
  }
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const at = order.times[s.key];
        const done = !!at;
        const next = !done && (i === 0 || !!order.times[STEPS[i - 1].key]);
        return (
          <li key={s.key} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : done ? "bg-primary" : "bg-line")} />
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                  done
                    ? "border-primary bg-primary text-primary-fg"
                    : next
                      ? "border-primary text-primary"
                      : "border-line text-fg-faint"
                )}
              >
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === STEPS.length - 1
                    ? "opacity-0"
                    : order.times[STEPS[i + 1]?.key]
                      ? "bg-primary"
                      : "bg-line"
                )}
              />
            </div>
            <span className={cn("text-xs font-medium", done ? "text-fg" : "text-fg-subtle")}>{s.label}</span>
            <span
              className="text-fg-faint hidden text-[11px] sm:block"
              title={at ? formatDateTime(at) : undefined}
            >
              {at ? timeAgo(at) : "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActionModal({
  order,
  action,
  onClose,
  onDone,
}: {
  order: Detail;
  action: "ship" | "cancel";
  onClose: () => void;
  onDone: (o: Detail) => void;
}) {
  const [courier, setCourier] = useState(order.courier ?? "");
  const [number, setNumber] = useState(order.tracking_number ?? "");
  const [url, setUrl] = useState(order.tracking_url ?? "");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = async () => {
    setBusy(true);
    try {
      const res = await ordersApi.act(order.id, {
        action,
        courier: courier.trim() || undefined,
        tracking_number: number.trim() || undefined,
        tracking_url: url.trim() || undefined,
        reason: reason.trim() || undefined,
        notify,
      });
      toast.success(res.message ?? "Done");
      onDone(res.data);
      onClose();
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={action === "ship" ? `Ship ${order.ref}` : `Cancel ${order.ref}?`}
      description={
        action === "ship"
          ? "Add tracking so the customer can follow the parcel."
          : "Stock goes back, and any coupon use is returned."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {action === "ship" ? "Back" : "Keep the order"}
          </Button>
          <Button variant={action === "cancel" ? "danger" : "primary"} loading={busy} onClick={run}>
            {action === "ship" ? "Mark shipped" : "Cancel order"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action === "ship" ? (
          <>
            <Input
              label="Courier"
              name="courier"
              maxLength={80}
              placeholder="e.g. Delhivery, Blue Dart, India Post"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
            />
            <Input
              label="Tracking number"
              name="tracking_number"
              maxLength={80}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <Input
              label="Tracking link"
              name="tracking_url"
              type="url"
              placeholder="https://"
              value={url}
              error={errors.tracking_url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </>
        ) : (
          <Input
            label="Reason (optional)"
            name="reason"
            maxLength={300}
            placeholder="e.g. Out of stock, customer asked"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        <Switch
          label="Tell the customer on WhatsApp"
          hint="Uses your order message settings."
          checked={notify}
          onChange={setNotify}
        />
      </div>
    </Modal>
  );
}

function AddressModal({
  order,
  onClose,
  onDone,
}: {
  order: Detail;
  onClose: () => void;
  onDone: (o: Detail) => void;
}) {
  const [address, setAddress] = useState<Address>({ ...EMPTY_ADDRESS, ...(order.address ?? {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const clean = cleanAddress(address);
    if (!clean) return setError("Enter the address");
    setBusy(true);
    try {
      const res = await ordersApi.update(order.id, { address: clean });
      toast.success("Address saved");
      onDone(res.data);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Delivery address"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save address
          </Button>
        </>
      }
    >
      <AddressFields value={address} onChange={setAddress} error={error} />
    </Modal>
  );
}

function ItemsModal({
  order,
  onClose,
  onDone,
}: {
  order: Detail;
  onClose: () => void;
  onDone: (o: Detail) => void;
}) {
  const [rows, setRows] = useState<ItemRow[]>(() =>
    order.items.map((i) => ({
      key: `o${i.id}`,
      variant_id: i.variant_id,
      name: i.name,
      variant_label: i.variant_label,
      image_url: i.image_url,
      unit_price: String(i.unit_price),
      quantity: i.quantity,
    }))
  );
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!rows.length) return toast.error("An order needs at least one item");
    setBusy(true);
    try {
      const res = await ordersApi.update(order.id, { items: toInput(rows) });
      toast.success("Items saved");
      onDone(res.data);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Edit items · ${order.ref}`}
      description="Totals and stock update when you save."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save items
          </Button>
        </>
      }
    >
      <ItemsEditor rows={rows} onChange={setRows} currency={order.currency} />
    </Modal>
  );
}

export function OrderDetailPage({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const {
    data: order,
    error,
    isLoading,
  } = useQuery({
    queryKey: ORDERS_QK.ONE(id),
    queryFn: async () => (await ordersApi.get(id)).data,
    // while waiting for the customer (address, payment choice, a link to be paid), check back
    refetchInterval: (q) =>
      q.state.data &&
      (["awaiting_address", "awaiting_payment"].includes(q.state.data.status) ||
        q.state.data.payments?.some((p) => p.status === "created") ||
        q.state.data.cod_check === "pending")
        ? 10_000
        : false,
  });
  const [modal, setModal] = useState<"ship" | "cancel" | "address" | "items" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState<string | null>(null);

  const apply = (o: Detail) => {
    queryClient.setQueryData(ORDERS_QK.ONE(id), o);
    void queryClient.invalidateQueries({ queryKey: ORDERS_QK.ALL });
  };
  const run = async (key: string, fn: () => Promise<{ message?: string; data: Detail }>) => {
    setBusy(key);
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      apply(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Spinner className="h-full" />;
  if (error || !order) return <ErrorBanner message={errorMessage(error ?? new Error("Order not found"))} />;

  const act = (action: OrderAction) =>
    action === "ship" || action === "cancel"
      ? setModal(action)
      : run(action, () => ordersApi.act(order.id, { action }));
  const primary = order.actions.find((a) => a !== "cancel");
  const editable = ["awaiting_address", "awaiting_payment", "confirmed"].includes(order.status);
  const checkout = ["awaiting_address", "awaiting_payment"].includes(order.status);
  const chatHref = order.contact.conversation_id
    ? `${CUSTOMER_ROUTES.INBOX()}?c=${order.contact.conversation_id}`
    : null;
  const internalValue = internal ?? order.internal_note ?? "";
  const paidOnline = order.payments.some((p) => p.status === "paid");
  const linkOpen = order.payments.some((p) => p.status === "created");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={CUSTOMER_ROUTES.COMMERCE()}
          aria-label="Back to orders"
          className="text-fg-subtle hover:bg-hover hover:text-fg border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-fg flex flex-wrap items-center gap-2 text-lg font-semibold">
            Order {order.ref}
            <StatusBadge status={order.status} />
            <PaymentBadge order={order} />
          </h1>
          <p className="text-fg-subtle truncate text-xs">
            {SOURCE_LABELS[order.source]}
            {order.external_ref ? ` ${order.external_ref}` : ""} ·{" "}
            {formatDateTime(order.placed_at ?? order.created_at)}
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          {order.actions.includes("cancel") && (
            <Button
              variant="ghost"
              leftIcon={Ban}
              className="text-danger hover:bg-danger-soft"
              onClick={() => act("cancel")}
            >
              Cancel
            </Button>
          )}
          <Dropdown
            align="right"
            width="w-56"
            trigger={() => (
              <Button variant="secondary" leftIcon={MoreHorizontal}>
                More
              </Button>
            )}
            items={[
              {
                label: "Invoice",
                icon: FileText,
                onClick: () => window.open(ordersApi.invoiceUrl(order.invoice_key), "_blank"),
              },
              ...(checkout && chatHref
                ? [
                    {
                      label: "Send checkout again",
                      icon: Send,
                      onClick: () => run("send", () => ordersApi.send(order.id)),
                    },
                    {
                      label: `Send cart reminder${order.recovery_sent ? ` (${order.recovery_sent} sent)` : ""}`,
                      icon: BellRing,
                      onClick: () => run("remind", () => cartsApi.remind(order.id)),
                    },
                  ]
                : []),
              ...(order.payment_status === "unpaid"
                ? [
                    {
                      label: "Mark paid",
                      icon: CircleDollarSign,
                      onClick: () => run("pay", () => ordersApi.payment(order.id, "paid")),
                    },
                  ]
                : order.payment_status === "paid" && !paidOnline
                  ? [
                      {
                        label: "Mark unpaid",
                        icon: CircleDollarSign,
                        onClick: () => run("pay", () => ordersApi.payment(order.id, "unpaid")),
                      },
                    ]
                  : []),
            ]}
          />
          {primary && (
            <Button
              leftIcon={
                primary === "ship"
                  ? Truck
                  : primary === "deliver"
                    ? PackageCheck
                    : primary === "pack"
                      ? Package
                      : Check
              }
              loading={busy === primary}
              onClick={() => act(primary)}
            >
              {ACTION_LABELS[primary]}
            </Button>
          )}
        </div>
      </div>

      {checkout && (
        <div className="border-warning/30 bg-warning-soft text-fg mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
          <MessageCircle className="text-warning h-5 w-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {order.status === "awaiting_address"
                ? "Waiting for the delivery address."
                : linkOpen
                  ? "Payment link sent: waiting for the customer to pay."
                  : "Waiting for the customer to choose how to pay."}
            </span>{" "}
            <span className="text-fg-subtle">
              It updates by itself when they reply. You can also confirm it yourself.
            </span>
          </p>
          {chatHref && (
            <Button size="sm" variant="secondary" href={chatHref}>
              Open chat
            </Button>
          )}
        </div>
      )}

      <Card className="mb-5">
        <CardBody>
          <Steps order={order} />
        </CardBody>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title={`Items · ${order.items_count}`}
              icon={ShoppingBag}
              actions={
                editable ? (
                  <Button size="sm" variant="secondary" leftIcon={Pencil} onClick={() => setModal("items")}>
                    Edit
                  </Button>
                ) : undefined
              }
            />
            <ul className="divide-line divide-y" aria-label="Items">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <ProductThumb src={i.image_url} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate text-sm font-medium">{i.name}</p>
                    <p className="text-fg-subtle truncate text-xs">
                      {[i.variant_label, i.retailer_id].filter(Boolean).join(" · ") || "Custom item"}
                    </p>
                  </div>
                  <p className="text-fg-subtle text-right text-xs whitespace-nowrap tabular-nums">
                    {i.unit_text} × {i.quantity}
                  </p>
                  <p className="text-fg w-24 text-right text-sm font-semibold tabular-nums">{i.total_text}</p>
                </li>
              ))}
            </ul>
            <div className="border-line border-t px-4 py-4 sm:px-5">
              <TotalsList
                t={order}
                currency={order.currency}
                coupon={order.coupon_code}
                taxInclusive={order.tax_inclusive}
                className="ml-auto max-w-sm"
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" icon={ClipboardList} />
            <CardBody className="space-y-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  void run("note", () => ordersApi.note(order.id, note.trim())).then(() => setNote(""));
                }}
              >
                <Input
                  aria-label="Add a note"
                  name="order-note"
                  maxLength={1000}
                  placeholder="Add a note for your team…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  wrapperClassName="flex-1"
                />
                <Button type="submit" variant="secondary" loading={busy === "note"} disabled={!note.trim()}>
                  Add
                </Button>
              </form>
              <ol className="space-y-3" aria-label="Order timeline">
                {[...order.events].reverse().map((e) => {
                  const Icon = EVENT_ICONS[e.kind] ?? ClipboardList;
                  return (
                    <li key={e.id} className="flex gap-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          e.kind === "note" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-fg text-sm break-words whitespace-pre-wrap">{e.text}</p>
                        <p className="text-fg-faint text-xs" title={formatDateTime(e.created_at)}>
                          {e.actor ? `${e.actor} · ` : ""}
                          {timeAgo(e.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5" aria-label="Order details">
          <Card>
            <CardHeader title="Customer" icon={UserRound} />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={order.contact.name || order.contact.phone || "Customer"} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-fg truncate text-sm font-semibold">{order.contact.name || "Customer"}</p>
                  <p className="text-fg-subtle truncate text-xs">{order.contact.phone || "No phone"}</p>
                </div>
              </div>
              {chatHref && (
                <Button size="sm" variant="secondary" leftIcon={MessageCircle} href={chatHref} fullWidth>
                  Open chat
                </Button>
              )}
              {order.note && (
                <div className="bg-page/60 border-line rounded-lg border p-2.5 text-sm">
                  <p className="text-fg-subtle mb-0.5 text-xs">Customer&apos;s note</p>
                  <p className="text-fg whitespace-pre-wrap">{order.note}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Delivery"
              icon={MapPin}
              actions={
                order.status !== "delivered" && order.status !== "cancelled" ? (
                  <Button size="sm" variant="ghost" leftIcon={Pencil} onClick={() => setModal("address")}>
                    {order.address ? "Edit" : "Add"}
                  </Button>
                ) : undefined
              }
            />
            <CardBody className="space-y-3 text-sm">
              {order.address ? (
                <div>
                  {order.address.name && <p className="text-fg font-medium">{order.address.name}</p>}
                  <p className="text-fg-subtle">{order.address_text}</p>
                  {order.address.phone && <p className="text-fg-subtle">{order.address.phone}</p>}
                </div>
              ) : (
                <p className="text-fg-subtle">No address yet.</p>
              )}
              {(order.courier || order.tracking_number || order.tracking_url) && (
                <div className="border-line border-t pt-3">
                  <p className="text-fg-subtle text-xs">Tracking</p>
                  <p className="text-fg">
                    {[order.courier, order.tracking_number].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {order.tracking_url && (
                    <a
                      href={order.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                    >
                      Track parcel <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <PaymentCard order={order} onChange={apply} />

          <Card>
            <CardHeader title="Note for your team" icon={StickyNote} />
            <CardBody className="space-y-2">
              <Textarea
                aria-label="Note for your team"
                name="internal_note"
                rows={3}
                maxLength={2000}
                value={internalValue}
                placeholder="Only your team sees this"
                onChange={(e) => setInternal(e.target.value)}
              />
              {internal !== null && internal !== (order.internal_note ?? "") && (
                <Button
                  size="sm"
                  loading={busy === "internal"}
                  onClick={() =>
                    run("internal", () =>
                      ordersApi.update(order.id, { internal_note: internal.trim() || null })
                    ).then(() => setInternal(null))
                  }
                >
                  Save note
                </Button>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

      {(modal === "ship" || modal === "cancel") && (
        <ActionModal order={order} action={modal} onClose={() => setModal(null)} onDone={apply} />
      )}
      {modal === "address" && <AddressModal order={order} onClose={() => setModal(null)} onDone={apply} />}
      {modal === "items" && <ItemsModal order={order} onClose={() => setModal(null)} onDone={apply} />}
    </>
  );
}
