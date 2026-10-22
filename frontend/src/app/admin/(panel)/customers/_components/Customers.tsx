"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Plus, Power, PowerOff, Trash2, UserRoundCheck } from "lucide-react";

import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Avatar,
  Badge,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  RowActions,
  StatusBadge,
  Switch,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { customersApi, type Customer } from "@/app/admin/_lib/api/customersApi";
import { PERM } from "@/config/permissions";
import { QK } from "@/config/query-keys";
import { formatDateTime, timeAgo } from "@/lib/utils";

import CustomerModal, { METHOD_LABELS } from "./CustomerModal";
import { CustomerKpis, type CustomerKpi } from "./CustomerKpis";
import { CustomerCard, CustomerListItem, WhatsAppBadge, contactName, customerName } from "./CustomerViews";

const GRID_ID = "customers";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Blocked" },
];
const METHOD_OPTIONS = Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));

const muted = <span className="text-fg-faint">—</span>;

const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

const daysAgo = (days: number) => {
  const d = new Date(Date.now() - days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const KPI_RULES: Record<CustomerKpi, FilterRule[]> = {
  all: [],
  active: [rule("status", "in", ["active"])],
  inactive: [rule("status", "in", ["inactive"])],
  recent: [rule("last_login_at", "after", daysAgo(30))],
  connected: [],
  not_connected: [],
};
// These KPIs filter through the ?whatsapp= list param rather than grid rules
const WHATSAPP_KPIS: CustomerKpi[] = ["connected", "not_connected"];

const signature = (rules: FilterRule[]) =>
  JSON.stringify(rules.map(({ field, op, value }) => [field, op, value]));

export default function Customers() {
  const can = usePermissions();
  const list = useUrlListState({ filterKeys: ["status", "method", "whatsapp"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({ api: customersApi, queryKey: QK.CUSTOMERS, noun: "customer", selection });

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.CUSTOMERS, params],
    queryFn: ({ signal }) => customersApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.CUSTOMERS, "stats"], queryFn: customersApi.stats });
  const inPage = data?.items.find((c) => c.id === modal.editId);
  const { data: fetched } = useQuery({
    queryKey: [QK.CUSTOMERS, "detail", modal.editId],
    queryFn: () => customersApi.detail(modal.editId!),
    enabled: !!modal.editId && !!data && !inPage,
  });

  if (!can(PERM.CUSTOMERS_VIEW)) return <AccessDenied />;

  const canCreate = can(PERM.CUSTOMERS_CREATE);
  const canUpdate = can(PERM.CUSTOMERS_UPDATE);
  const canDelete = can(PERM.CUSTOMERS_DELETE);
  const editing = modal.editId ? (inPage ?? fetched ?? null) : null;
  const filtered = list.hasFilters || grid.filters.length > 0;

  const current = signature(grid.filters);
  const whatsappFilter = list.filters.whatsapp as CustomerKpi;
  const onlyWhatsApp =
    !!whatsappFilter &&
    !list.search &&
    !list.filters.status &&
    !list.filters.method &&
    grid.filters.length === 0;
  const activeKpi = whatsappFilter
    ? onlyWhatsApp && WHATSAPP_KPIS.includes(whatsappFilter)
      ? whatsappFilter
      : null
    : list.hasFilters && grid.filters.length === 0
      ? null
      : ((Object.keys(KPI_RULES) as CustomerKpi[])
          .filter((k) => !WHATSAPP_KPIS.includes(k))
          .find((k) => signature(KPI_RULES[k]) === current) ?? null);

  const selectKpi = (kpi: CustomerKpi) => {
    selection.clear();
    grid.setFiltersWith(KPI_RULES[kpi], {
      status: null,
      method: null,
      search: null,
      whatsapp: WHATSAPP_KPIS.includes(kpi) ? kpi : null,
    });
  };

  const statusControl = (row: Customer) =>
    canUpdate ? (
      <Switch
        size="sm"
        checked={row.status === "active"}
        onChange={() => actions.toggle(row.id)}
        aria-label={`Toggle status for ${customerName(row)}`}
      />
    ) : (
      <StatusBadge status={row.status} />
    );

  const rowActions = (row: Customer) => (
    <RowActions
      history={{ type: "customer", id: row.id, label: customerName(row) }}
      onEdit={canUpdate ? () => modal.openEdit(row.id) : undefined}
      onDelete={canDelete ? () => actions.remove(row.id, customerName(row)) : undefined}
    />
  );

  const verified = (on: string | null) =>
    on ? <BadgeCheck className="inline h-3.5 w-3.5 text-emerald-500" aria-label="Verified" /> : null;

  const columns: GridColumn<Customer>[] = [
    {
      id: "name",
      header: "Customer",
      type: "text",
      size: 230,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={customerName(row)} src={row.avatar} size={28} />
          <span className="min-w-0">
            <span className="text-fg block truncate font-medium">{customerName(row)}</span>
            {contactName(row) && (
              <span className="text-fg-subtle block truncate text-xs">{contactName(row)}</span>
            )}
          </span>
        </span>
      ),
    },
    {
      id: "whatsapp",
      header: "WhatsApp",
      sortable: false,
      size: 190,
      cell: (row) => <WhatsAppBadge row={row} />,
    },
    {
      id: "email",
      header: "Email",
      type: "text",
      size: 220,
      cell: (row) =>
        row.email ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="truncate">{row.email}</span>
            {verified(row.email_verified_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "phone",
      header: "Mobile",
      type: "text",
      size: 160,
      cell: (row) =>
        row.phone ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {row.phone}
            {verified(row.phone_verified_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "signup_method",
      header: "Joined with",
      type: "enum",
      size: 150,
      options: METHOD_OPTIONS,
      cell: (row) => <Badge>{METHOD_LABELS[row.signup_method]}</Badge>,
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 110,
      options: STATUS_OPTIONS,
      cell: statusControl,
    },
    {
      id: "last_login_at",
      header: "Last sign-in",
      type: "date",
      size: 140,
      cell: (row) =>
        row.last_login_at ? (
          <span title={formatDateTime(row.last_login_at)} className="text-fg-subtle whitespace-nowrap">
            {timeAgo(row.last_login_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "last_login_method",
      header: "Last method",
      type: "enum",
      size: 140,
      options: METHOD_OPTIONS,
      defaultHidden: true,
      cell: (row) => (row.last_login_method ? METHOD_LABELS[row.last_login_method] : muted),
    },
    {
      id: "has_password",
      header: "Password",
      type: "bool",
      sortable: false,
      size: 100,
      defaultHidden: true,
      cell: (row) => (row.has_password ? "Yes" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "google_linked",
      header: "Google",
      type: "bool",
      sortable: false,
      size: 100,
      defaultHidden: true,
      cell: (row) => (row.google_linked ? "Linked" : <span className="text-fg-faint">No</span>),
    },
    {
      id: "created_at",
      header: "Joined",
      type: "date",
      size: 130,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      size: 110,
      minSize: 110,
      alwaysVisible: true,
      align: "right",
      cell: rowActions,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Customers</h1>
      <CustomerKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
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
          searchPlaceholder="Search business, name, email, mobile…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "customer" : "customers"}
          actions={
            canCreate && (
              <Tooltip label="New customer" align="end">
                <Button
                  iconOnly
                  leftIcon={Plus}
                  aria-label="New customer"
                  onClick={modal.openCreate}
                  className="h-9 w-9"
                />
              </Tooltip>
            )
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={canUpdate ? (row) => modal.openEdit(row.id) : undefined}
          highlightId={modal.focusId ?? modal.editId}
          renderListItem={(row, slots) => (
            <CustomerListItem row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          renderCard={(row, slots) => (
            <CustomerCard row={row} slots={slots} status={statusControl(row)} actions={rowActions(row)} />
          )}
          empty={
            <EmptyState
              icon={UserRoundCheck}
              title={filtered ? "No customers match" : "No customers yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Customers appear here when they sign up on the website."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="customers"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canUpdate && (
          <>
            <Button size="sm" variant="secondary" leftIcon={Power} onClick={() => actions.bulk("activate")}>
              Activate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={PowerOff}
              onClick={() => actions.bulk("deactivate")}
            >
              Block
            </Button>
          </>
        )}
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => actions.bulk("delete")}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <CustomerModal
        open={(modal.isCreate && canCreate) || (!!editing && canUpdate)}
        customer={editing}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
