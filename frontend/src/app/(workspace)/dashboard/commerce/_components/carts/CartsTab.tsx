"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, MessageCircle, Plus, Send, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type GridColumn } from "@/app/admin/_components/grid";
import {
  Badge,
  Button,
  EmptyState,
  Pagination,
  Select,
  Skeleton,
  Switch,
} from "@/app/admin/_components/ui/index";
import { CustomerApiError, errorMessage } from "@/app/(customer)/_lib/customerApi";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { Tooltip } from "../../../_components/Tooltip";
import {
  CARTS_QK,
  cartsApi,
  ORDERS_QK,
  ordersApi,
  type Cart,
  type CartStats,
  type RecoverySettings,
  type RecoveryStep,
} from "../../../_lib/commerceApi";
import { INBOX_QK, inboxApi } from "../../../_lib/inboxApi";
import { Block } from "../CheckoutSettings";
import { StatusBadge } from "../orders/labels";

const VIEWS = [
  { value: "open", label: "Waiting" },
  { value: "recovered", label: "Recovered" },
  { value: "lost", label: "Lost" },
  { value: "setup", label: "Reminders" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const AFTER = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "180", label: "3 hours" },
  { value: "360", label: "6 hours" },
  { value: "720", label: "12 hours" },
  { value: "1440", label: "1 day" },
  { value: "2880", label: "2 days" },
  { value: "4320", label: "3 days" },
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

function CartList({ state, on }: { state: Exclude<View, "setup">; on: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["view"] });
  const grid = useGridUrlState();
  const params = { ...list.params, view: undefined, state };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: CARTS_QK.LIST(params),
    queryFn: ({ signal }) => cartsApi.page(params, signal),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const remind = async (c: Cart) => {
    setBusy(c.id);
    try {
      const res = await cartsApi.remind(c.id);
      toast.success(res.message ?? "Reminder sent");
      await queryClient.invalidateQueries({ queryKey: CARTS_QK.ALL });
      await queryClient.invalidateQueries({ queryKey: ORDERS_QK.ALL });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const reminders = (c: Cart) =>
    state === "recovered"
      ? `Came back after reminder ${c.recovered_step}`
      : c.recovery_sent
        ? `${c.recovery_sent} of ${c.recovery_steps} sent${c.last_recovery_at ? ` · last ${timeAgo(c.last_recovery_at)}` : ""}`
        : "None sent yet";

  const columns: GridColumn<Cart>[] = [
    {
      id: "number",
      header: "Cart",
      sortable: false,
      size: 200,
      alwaysVisible: true,
      cell: (c) => (
        <span className="block min-w-0">
          <span className="text-fg block font-semibold tabular-nums">
            {c.ref} <span className="text-fg-subtle font-normal">· {c.contact.name || c.contact.phone}</span>
          </span>
          <span className="text-fg-subtle block text-xs" title={formatDateTime(c.placed_at ?? c.created_at)}>
            {timeAgo(c.placed_at ?? c.created_at)}
          </span>
        </span>
      ),
    },
    {
      id: "items",
      header: "Items",
      sortable: false,
      size: 240,
      cell: (c) => (
        <span className="text-fg-subtle block truncate text-sm" title={c.items_preview}>
          {c.items_preview}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      sortable: false,
      size: 110,
      align: "right",
      cell: (c) => <span className="text-fg font-semibold tabular-nums">{c.total_text}</span>,
    },
    {
      id: "status",
      header: "Stopped at",
      sortable: false,
      size: 160,
      cell: (c) => <StatusBadge status={c.status} />,
    },
    {
      id: "reminders",
      header: "Reminders",
      sortable: false,
      size: 220,
      cell: (c) => (
        <span className="block min-w-0 text-xs">
          <span className="text-fg block truncate">{reminders(c)}</span>
          {state === "open" && c.next_reminder_at && (
            <span className="text-fg-subtle block truncate" title={formatDateTime(c.next_reminder_at)}>
              Next{" "}
              {new Date(c.next_reminder_at) <= new Date() ? "any moment" : formatDateTime(c.next_reminder_at)}
            </span>
          )}
          {state === "open" && !on && <span className="text-fg-faint block">Reminders are off</span>}
        </span>
      ),
    },
    {
      id: "act",
      header: "",
      sortable: false,
      size: 96,
      minSize: 96,
      align: "right",
      alwaysVisible: true,
      cell: (c) => (
        <span className="flex justify-end gap-1">
          {state === "open" && (
            <Tooltip label="Send a reminder now" align="end">
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                leftIcon={Send}
                loading={busy === c.id}
                aria-label={`Send a reminder for ${c.ref}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void remind(c);
                }}
                className="text-fg-faint hover:bg-primary-soft hover:text-primary"
              />
            </Tooltip>
          )}
          {c.contact.conversation_id && (
            <Tooltip label="Open chat" align="end">
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                leftIcon={MessageCircle}
                aria-label={`Open the chat for ${c.ref}`}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`${CUSTOMER_ROUTES.INBOX()}?c=${c.contact.conversation_id}`);
                }}
                className="text-fg-faint hover:bg-primary-soft hover:text-primary"
              />
            </Tooltip>
          )}
        </span>
      ),
    },
  ];

  return (
    <DataGrid
      id={`ws-carts-${state}`}
      columns={columns}
      rows={data?.items}
      getRowId={(r) => r.id}
      loading={isLoading}
      fetching={isFetching}
      grid={grid}
      search={list.searchInput}
      onSearch={list.setSearchInput}
      searchPlaceholder="Order number, name or phone"
      count={data?.meta.total}
      countLabel={data?.meta.total === 1 ? "cart" : "carts"}
      onRowClick={(c) => router.push(CUSTOMER_ROUTES.COMMERCE_ORDER(c.id))}
      renderListItem={(c) => (
        <div className="flex items-center gap-3">
          <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <ShoppingCart className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-fg flex items-center gap-2 text-sm font-semibold">
              {c.total_text}
              <span className="text-fg-subtle truncate font-normal">
                {c.ref} · {c.contact.name || c.contact.phone}
              </span>
            </p>
            <p className="text-fg-subtle truncate text-xs">{reminders(c)}</p>
          </div>
          {state === "open" && (
            <Button
              size="sm"
              variant="secondary"
              iconOnly
              leftIcon={Send}
              loading={busy === c.id}
              aria-label={`Send a reminder for ${c.ref}`}
              onClick={(e) => {
                e.stopPropagation();
                void remind(c);
              }}
            />
          )}
        </div>
      )}
      renderCard={(c) => (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-fg text-sm font-semibold">{c.total_text}</p>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-fg-subtle mt-1 truncate text-xs">
            {c.ref} · {c.contact.name || c.contact.phone}
          </p>
          <p className="text-fg-subtle mt-2 line-clamp-2 min-h-8 text-xs">{c.items_preview}</p>
          <p className="border-line text-fg-faint mt-3 border-t pt-3 text-xs">{reminders(c)}</p>
        </>
      )}
      empty={
        <EmptyState
          icon={ShoppingCart}
          title={
            state === "open"
              ? "No carts waiting"
              : state === "recovered"
                ? "None recovered yet"
                : "No lost carts"
          }
          description={
            state === "open"
              ? "When a customer sends a cart or taps Buy now and stops before finishing, it shows up here."
              : state === "recovered"
                ? "Orders finished after a cart reminder show up here."
                : "Carts that got reminders but were cancelled or left for over a week."
          }
        />
      }
      footer={
        <Pagination
          meta={data?.meta}
          onPageChange={list.setPage}
          onPerPageChange={list.setPerPage}
          unit="carts"
        />
      }
    />
  );
}

function ReminderSetup({ settings, stats }: { settings: RecoverySettings; stats: CartStats | undefined }) {
  const queryClient = useQueryClient();
  const [on, setOn] = useState(settings.on);
  const [steps, setSteps] = useState<RecoveryStep[]>(settings.steps);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data: coupons } = useQuery({
    queryKey: ORDERS_QK.COUPONS,
    queryFn: async () => (await ordersApi.coupons()).data,
  });
  const { data: templates } = useQuery({
    queryKey: INBOX_QK.TEMPLATES,
    queryFn: async () => (await inboxApi.templates()).data,
    staleTime: 60_000,
  });
  const usable = (coupons ?? []).filter((c) => c.state === "active" || c.state === "scheduled");
  const approved = (templates ?? []).filter((t) => t.category !== "authentication");
  const setStep = (i: number, patch: Partial<RecoveryStep>) => {
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setErrors({});
  };
  const addStep = () => {
    const used = new Set(steps.map((s) => s.after));
    const next = AFTER.map((a) => Number(a.value)).find(
      (m) => !used.has(m) && m > (steps.at(-1)?.after ?? 0)
    );
    setSteps((s) => [...s, { after: next ?? 4320, coupon_id: null, template_id: null }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await cartsApi.saveSettings({ on, steps });
      toast.success(res.message ?? "Saved");
      setSteps(res.data.steps);
      await queryClient.invalidateQueries({ queryKey: CARTS_QK.ALL });
    } catch (err) {
      if (err instanceof CustomerApiError) setErrors(err.errors);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <Block
        title="Abandoned-cart reminders"
        description="Win back customers who sent a cart or tapped Buy now, then stopped before finishing."
        icon={BellRing}
      >
        <Switch
          label="Send cart reminders"
          hint="Each reminder shows the cart with Complete order and No thanks. Customers who opted out never get one."
          checked={on}
          onChange={setOn}
        />
        <ol className="space-y-3" aria-label="Reminders">
          {steps.map((s, i) => {
            const stat = stats?.steps[i];
            return (
              <li key={i} className="border-line rounded-xl border p-3">
                <div className="mb-3 flex items-center gap-2">
                  <span className="bg-primary-soft text-primary flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-fg flex-1 text-sm font-medium">Reminder {i + 1}</span>
                  {stat && stat.sent > 0 && (
                    <Badge tone="success">
                      {stat.recovered} of {stat.sent} came back · {stat.revenue_text}
                    </Badge>
                  )}
                  {steps.length > 1 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      iconOnly
                      leftIcon={Trash2}
                      aria-label={`Remove reminder ${i + 1}`}
                      onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}
                    />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    id={`step_${i}_after`}
                    label="Send after"
                    value={String(s.after)}
                    options={AFTER}
                    error={errors[`steps.${i}.after`]}
                    onChange={(v) => setStep(i, { after: Number(v) })}
                  />
                  <Select
                    id={`step_${i}_coupon`}
                    label="Add a coupon"
                    value={s.coupon_id ?? ""}
                    options={[
                      { value: "", label: "No coupon" },
                      ...usable.map((c) => ({ value: c.id, label: `${c.code} · ${c.label}` })),
                    ]}
                    error={errors[`steps.${i}.coupon_id`]}
                    onChange={(v) => setStep(i, { coupon_id: v ? Number(v) : null })}
                  />
                  <Select
                    id={`step_${i}_template`}
                    label="If the chat is closed"
                    value={s.template_id ?? ""}
                    options={[
                      { value: "", label: "Don't send" },
                      ...approved.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                    error={errors[`steps.${i}.template_id`]}
                    onChange={(v) => setStep(i, { template_id: v ? Number(v) : null })}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {(errors.steps || errors[""]) && <p className="text-danger text-xs">{errors.steps || errors[""]}</p>}
        {steps.length < 3 && (
          <Button variant="secondary" size="sm" leftIcon={Plus} onClick={addStep}>
            Add a reminder
          </Button>
        )}
        <p className="text-fg-faint text-xs">
          Times count from when the cart was placed. A coupon is added only when it&apos;s valid for that cart
          and gives a bigger discount. Templates get the first name, order number and the coupon code (or
          total) as {"{{1}}, {{2}}, {{3}}"}: add a quick reply like “Complete order”.
        </p>
      </Block>
      <div className="flex justify-end">
        <Button loading={saving} onClick={save}>
          Save reminders
        </Button>
      </div>
    </div>
  );
}

/** Commerce → Carts: carts customers left during checkout, reminders that win them back, and the results. */
export function CartsTab({ view, onView }: { view: View; onView: (v: View) => void }) {
  const { data: settings } = useQuery({
    queryKey: CARTS_QK.SETTINGS,
    queryFn: async () => (await cartsApi.settings()).data,
  });
  const { data: stats } = useQuery({
    queryKey: CARTS_QK.STATS,
    queryFn: async () => (await cartsApi.stats()).data,
  });
  return (
    <>
      <div
        className="no-scrollbar border-line flex items-center gap-1.5 overflow-x-auto border-b px-4 py-2.5 sm:px-5"
        role="tablist"
        aria-label="Carts view"
      >
        {VIEWS.map((v) => (
          <Pill key={v.value} on={view === v.value} onClick={() => onView(v.value)}>
            {v.label}
          </Pill>
        ))}
      </div>
      {settings && !settings.on && view !== "setup" && (
        <div className="border-primary/25 bg-primary-soft/60 mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm sm:mx-5">
          <BellRing className="text-primary h-5 w-5 shrink-0" aria-hidden />
          <p className="text-fg min-w-0 flex-1">
            <span className="font-semibold">Cart reminders are off.</span>{" "}
            <span className="text-fg-subtle">Turn them on to win back customers who stop before paying.</span>
          </p>
          <Button size="sm" onClick={() => onView("setup")}>
            Set up reminders
          </Button>
        </div>
      )}
      {view === "setup" ? (
        settings ? (
          <ReminderSetup key={JSON.stringify(settings)} settings={settings} stats={stats} />
        ) : (
          <Skeleton className="m-5 h-64 rounded-xl" />
        )
      ) : (
        <CartList key={view} state={view} on={!!settings?.on} />
      )}
    </>
  );
}

export type CartView = View;
export const CART_VIEWS = VIEWS.map((v) => v.value);
