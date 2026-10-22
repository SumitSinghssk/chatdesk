"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataGrid, useGridUrlState, type GridColumn } from "@/app/admin/_components/grid";
import {
  AccessDenied,
  Avatar,
  Button,
  BulkActionBar,
  Card,
  Dropdown,
  EmptyState,
  Pagination,
  StatusBadge,
  Tabs,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { TransferMenu } from "@/app/admin/_components/TransferMenu";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useListActions } from "@/app/admin/_hooks/useListActions";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import {
  enquiriesApi,
  ENQUIRY_STATUSES,
  type Enquiry,
  type EnquiryBulkAction,
} from "@/app/admin/_lib/api/enquiriesApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import type { FilterRule } from "@/app/admin/_components/grid";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { EnquiryKpis, type KpiAction } from "./EnquiryKpis";
import { EnquiryCard, EnquiryListItem } from "./EnquiryViews";
import { EnquiryDrawer } from "./EnquiryDrawer";
import EnquiryModal from "./EnquiryModal";
import { STATUS_LABELS, STATUS_OPTIONS, sourceLabel } from "./constants";

import { QK } from "@/config/query-keys";
type View = "open" | "follow_up" | "mine" | "any";

const API_VIEW: Record<View, string | undefined> = {
  open: "open",
  follow_up: "follow_up",
  mine: "mine",
  any: undefined,
};

const muted = <span className="text-fg-faint">—</span>;

export default function Enquiries() {
  const can = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const list = useUrlListState({
    filterKeys: ["view", "status", "source", "assigned", "date_from", "date_to"],
  });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const actions = useListActions({
    api: {
      remove: enquiriesApi.remove,
      bulk: (ids, action) => enquiriesApi.bulk(ids, action as EnquiryBulkAction),
    },
    queryKey: QK.ENQUIRIES,
    noun: "enquiry",
    selection,
  });

  const openId = Number(searchParams.get("enquiry")) || null;
  const enquiryHref = (id: number | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (id) sp.set("enquiry", String(id));
    else sp.delete("enquiry");
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const openEnquiry = (id: number) => router.push(enquiryHref(id), { scroll: false });
  const closeEnquiry = () => router.replace(enquiryHref(null), { scroll: false });

  const view: View =
    (["open", "follow_up", "mine", "any"] as const).find((v) => v === list.filters.view) ?? "open";
  const params = { ...list.params, view: API_VIEW[view], ...grid.apiParams };

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: [QK.ENQUIRIES, params],
    queryFn: ({ signal }) => enquiriesApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: [QK.ENQUIRIES, "stats"],
    queryFn: () => enquiriesApi.stats(),
  });
  const { data: sources = [] } = useQuery({
    queryKey: [QK.ENQUIRIES, "sources"],
    queryFn: () => enquiriesApi.sources(),
  });
  const { data: assignees = [] } = useQuery({
    queryKey: [QK.ENQUIRIES, "assignees"],
    queryFn: () => enquiriesApi.assignees(),
  });

  if (!can(PERM.ENQUIRIES_VIEW)) return <AccessDenied />;

  const canUpdate = can(PERM.ENQUIRIES_UPDATE);
  const canDelete = can(PERM.ENQUIRIES_DELETE);

  const markAs = async (status: (typeof ENQUIRY_STATUSES)[number]) => {
    try {
      const res = await enquiriesApi.bulk(selection.ids, `mark-${status}`);
      toast.success(res.message ?? "Updated");
      selection.clear();
      await actions.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Bulk action failed"));
    }
  };

  const selectKpi = (action: KpiAction) => {
    selection.clear();
    const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
      id: field,
      field,
      op,
      value,
    });
    const reset = {
      status: null,
      source: null,
      assigned: null,
      date_from: null,
      date_to: null,
      search: null,
    };
    if (action === "open") grid.setFiltersWith([], { ...reset, view: null });
    else if (action === "follow_up") grid.setFiltersWith([], { ...reset, view: "follow_up" });
    else if (action === "unread") grid.setFiltersWith([rule("seen", "is_false")], { ...reset, view: "any" });
    else if (action === "unassigned")
      grid.setFiltersWith([rule("assignee", "is_empty")], { ...reset, view: null });
    else if (action === "week") {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      grid.setFiltersWith([rule("created_at", "between", [toYmd(from), toYmd(today)])], {
        ...reset,
        view: "any",
      });
    } else grid.setFiltersWith([rule("status", "in", [action.status])], { ...reset, view: "any" });
  };

  const now = dataUpdatedAt;
  const columns: GridColumn<Enquiry>[] = [
    {
      id: "name",
      header: "Contact",
      type: "text",
      size: 210,
      alwaysVisible: true,
      cell: (row) => {
        const unseen = !row.seen_at;
        return (
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-label={unseen ? "Unread" : undefined}
              className={cn("h-2 w-2 shrink-0 rounded-full", unseen ? "bg-primary" : "bg-transparent")}
            />
            <Link
              href={enquiryHref(row.id)}
              scroll={false}
              className={cn("text-fg hover:text-primary truncate", unseen ? "font-bold" : "font-medium")}
            >
              {row.name}
            </Link>
          </span>
        );
      },
    },
    {
      id: "reference",
      header: "Ref",
      type: "number",
      size: 110,
      cell: (row) => <span className="text-fg-subtle font-mono text-xs">{row.reference}</span>,
    },
    { id: "email", header: "Email", type: "text", size: 210, cell: (row) => row.email || muted },
    { id: "phone", header: "Phone", type: "text", size: 140, cell: (row) => row.phone || muted },
    {
      id: "company",
      header: "Company",
      type: "text",
      size: 160,
      defaultHidden: true,
      cell: (row) => row.company || muted,
    },
    {
      id: "subject",
      header: "Subject",
      type: "text",
      size: 240,
      cell: (row) => (
        <span
          className={cn("block truncate", !row.seen_at && "text-fg font-semibold")}
          title={row.message_preview}
        >
          {row.subject || <span className="text-fg-subtle">{row.message_preview}</span>}
        </span>
      ),
    },
    {
      id: "message",
      header: "Message",
      type: "text",
      sortable: false,
      size: 280,
      defaultHidden: true,
      cell: (row) => <span className="text-fg-subtle">{row.message_preview}</span>,
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 130,
      options: STATUS_OPTIONS.map(({ value, label }) => ({ value, label })),
      cell: (row) => <StatusBadge status={row.status} label={STATUS_LABELS[row.status]} />,
    },
    {
      id: "source",
      header: "Source",
      type: "enum",
      size: 120,
      options: sources.map((s) => ({ value: s, label: sourceLabel(s) })),
      cell: (row) => sourceLabel(row.source),
    },
    {
      id: "assignee",
      header: "Assignee",
      type: "enum",
      size: 170,
      options: assignees.map((u) => ({ value: String(u.id), label: u.name })),
      cell: (row) =>
        row.assignee ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={row.assignee.name} size={20} />
            <span className="truncate">{row.assignee.name}</span>
          </span>
        ) : (
          <span className="text-fg-faint">Unassigned</span>
        ),
    },
    {
      id: "follow_up_at",
      header: "Follow-up",
      type: "date",
      size: 150,
      cell: (row) =>
        row.follow_up_at ? (
          <span
            className={cn(
              "whitespace-nowrap",
              new Date(row.follow_up_at).getTime() < now && "text-danger font-medium"
            )}
            title={formatDateTime(row.follow_up_at)}
          >
            {formatDateTime(row.follow_up_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "created_at",
      header: "Received",
      type: "date",
      size: 130,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(row.created_at)}
        </span>
      ),
    },
    {
      id: "seen",
      header: "Read",
      type: "bool",
      sortable: false,
      size: 90,
      defaultHidden: true,
      cell: (row) => (row.seen_at ? "Yes" : <span className="text-primary font-medium">No</span>),
    },
  ];

  return (
    <>
      <h1 className="sr-only">Enquiries</h1>
      <EnquiryKpis stats={stats} onSelect={selectKpi} />

      <Card>
        <Tabs<View>
          className="px-3 pt-1"
          value={view}
          onChange={(v) => {
            selection.clear();
            list.setFilter("view", v === "open" ? "" : v);
          }}
          tabs={[
            { value: "open", label: "Open", count: stats?.open },
            { value: "follow_up", label: "Follow-up due", count: stats?.follow_up_due },
            { value: "mine", label: "Mine", count: stats?.mine },
            { value: "any", label: "All", count: stats?.total },
          ]}
        />
        <DataGrid
          id="enquiries"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search name, email, ENQ-00012…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "enquiry" : "enquiries"}
          actions={
            <>
              <TransferMenu
                compact
                type="enquiries"
                queryKey={QK.ENQUIRIES}
                canExport={can(PERM.ENQUIRIES_VIEW)}
                canImport={false}
              />
              {can(PERM.ENQUIRIES_CREATE) && (
                <Tooltip label="New enquiry" align="end">
                  <Button
                    iconOnly
                    leftIcon={Plus}
                    aria-label="New enquiry"
                    onClick={modal.openCreate}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canUpdate || canDelete ? selection : undefined}
          onRowClick={(row) => openEnquiry(row.id)}
          highlightId={openId ?? modal.focusId}
          renderListItem={(row, slots) => (
            <EnquiryListItem row={row} slots={slots} href={enquiryHref(row.id)} now={now} />
          )}
          renderCard={(row, slots) => (
            <EnquiryCard row={row} slots={slots} href={enquiryHref(row.id)} now={now} />
          )}
          empty={
            <EmptyState
              title={list.hasFilters || grid.filters.length ? "No enquiries match" : "No enquiries yet"}
              description={
                list.hasFilters || grid.filters.length
                  ? "Try another view, search or filter."
                  : "Messages from the website contact form show up here. You can also log one manually."
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="enquiries"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canUpdate && (
          <div className="**:[[role=menu]]:bottom-full **:[[role=menu]]:mt-0 **:[[role=menu]]:mb-1.5">
            <Dropdown
              align="left"
              trigger={() => (
                <Button size="sm" variant="secondary" leftIcon={Tag} rightIcon={ChevronDown}>
                  Mark as
                </Button>
              )}
              items={STATUS_OPTIONS.map((o) => ({ label: o.label, onClick: () => markAs(o.value) }))}
            />
          </div>
        )}
        {canDelete && (
          <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => actions.bulk("delete")}>
            Delete
          </Button>
        )}
      </BulkActionBar>

      <EnquiryDrawer id={openId} onClose={closeEnquiry} />

      <EnquiryModal
        open={modal.isCreate && can(PERM.ENQUIRIES_CREATE)}
        enquiry={null}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          actions.refresh();
        }}
      />
    </>
  );
}
