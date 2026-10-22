"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, CornerUpRight, Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { DataGrid, useGridUrlState, type FilterRule, type GridColumn } from "@/app/admin/_components/grid";
import { toYmd } from "@/app/admin/_components/ui/Calendar";
import {
  AccessDenied,
  Button,
  BulkActionBar,
  Card,
  EmptyState,
  Pagination,
  RowActions,
  Tabs,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { TransferMenu } from "@/app/admin/_components/TransferMenu";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { notFoundApi, type NotFoundLog, type NotFoundTab } from "@/app/admin/_lib/api/notFoundApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { CreateRedirectModal } from "./CreateRedirectModal";
import { NotFoundKpis, type NotFoundKpi } from "./NotFoundKpis";
import { NotFoundCard, NotFoundListItem, RedirectInfo } from "./NotFoundViews";

import { QK } from "@/config/query-keys";
type UrlTab = "open" | "redirected" | "ignored" | "any";
const API_TAB: Record<UrlTab, NotFoundTab> = {
  open: "open",
  redirected: "redirected",
  ignored: "ignored",
  any: "all",
};

const muted = <span className="text-fg-faint">—</span>;
const rule = (field: string, op: FilterRule["op"], value: FilterRule["value"] = null): FilterRule => ({
  id: field,
  field,
  op,
  value,
});

export default function NotFound() {
  const can = usePermissions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useUrlListState({ filterKeys: ["tab"] });
  const grid = useGridUrlState();
  const selection = useBulkSelection();
  const [redirecting, setRedirecting] = useState<NotFoundLog | null>(null);

  const tab: UrlTab =
    (["open", "redirected", "ignored", "any"] as const).find((t) => t === list.filters.tab) ?? "open";
  const { tab: _urlTab, ...listParams } = list.params;
  const params = { ...listParams, ...grid.apiParams };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [QK.NOT_FOUND, params, tab],
    queryFn: ({ signal }) => notFoundApi.page(params, API_TAB[tab], signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({ queryKey: [QK.NOT_FOUND, "stats"], queryFn: () => notFoundApi.stats() });

  if (!can(PERM.NOT_FOUND_VIEW)) return <AccessDenied />;

  const canManage = can(PERM.NOT_FOUND_MANAGE);
  const canRedirect = canManage && can(PERM.REDIRECTS_CREATE);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.NOT_FOUND] });

  const run = async (fn: () => Promise<{ message?: string }>, fallback: string, clearSelection = false) => {
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      if (clearSelection) selection.clear();
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, fallback));
    }
  };

  const remove = async (ids: number[], label?: string) => {
    const ok = await confirm({
      title: label ? "Delete 404 entry?" : `Delete ${ids.length} entr${ids.length === 1 ? "y" : "ies"}?`,
      message: label ? (
        <>
          <b className="font-mono">{label}</b> will be removed from the log. It reappears if visited again.
        </>
      ) : (
        "Selected entries will be removed from the log. They reappear if visited again."
      ),
      confirmLabel: "Delete",
    });
    if (ok) await run(() => notFoundApi.remove(ids), "Couldn't delete entries", !label);
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: "Clear the whole 404 log?",
      message:
        "Every logged entry (including ignored ones) will be permanently deleted. Existing redirects are kept.",
      confirmLabel: "Clear all",
    });
    if (ok) await run(() => notFoundApi.clear(), "Couldn't clear the log", true);
  };

  const copy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const only = grid.filters.length === 1 ? grid.filters[0] : null;
  const plain = !grid.filters.length && !grid.sort.length && !list.search;
  const activeKpi: NotFoundKpi | null =
    tab === "open" && plain
      ? "open"
      : (tab === "redirected" || tab === "ignored") && plain
        ? tab
        : tab === "any" && !grid.filters.length && grid.sort[0]?.id === "hits" && grid.sort[0].desc
          ? "hits"
          : tab === "any" && only?.field === "last_seen_at" && only.op === "between"
            ? "recent"
            : tab === "open" &&
                only?.field === "path" &&
                only.op === "equals" &&
                only.value === stats?.top?.path
              ? "top"
              : null;

  const selectKpi = (kpi: NotFoundKpi) => {
    selection.clear();
    const reset = { search: null, sort: null };
    if (kpi === "open") grid.setFiltersWith([], { ...reset, tab: null });
    else if (kpi === "redirected" || kpi === "ignored") grid.setFiltersWith([], { ...reset, tab: kpi });
    else if (kpi === "hits") grid.setFiltersWith([], { ...reset, tab: "any", sort: "-hits" });
    else if (kpi === "recent") {
      const today = new Date();
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      grid.setFiltersWith([rule("last_seen_at", "between", [toYmd(yesterday), toYmd(today)])], {
        ...reset,
        tab: "any",
      });
    } else if (stats?.top)
      grid.setFiltersWith([rule("path", "equals", stats.top.path)], { ...reset, tab: null });
  };

  const rowActions = (row: NotFoundLog) =>
    canManage && (
      <RowActions onDelete={() => remove([row.id], row.path)}>
        {canRedirect && !row.has_redirect && (
          <Button size="sm" variant="outline" leftIcon={CornerUpRight} onClick={() => setRedirecting(row)}>
            Redirect
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={row.ignored ? Eye : EyeOff}
          aria-label={row.ignored ? "Unignore" : "Ignore"}
          title={row.ignored ? "Unignore" : "Ignore"}
          onClick={() =>
            run(
              () => (row.ignored ? notFoundApi.unignore([row.id]) : notFoundApi.ignore([row.id])),
              "Couldn't update entry"
            )
          }
        />
      </RowActions>
    );

  const columns: GridColumn<NotFoundLog>[] = [
    {
      id: "path",
      header: "Path",
      type: "text",
      size: 280,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1">
          <span className="text-fg truncate font-mono text-xs font-semibold" title={row.path}>
            {row.path}
          </span>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            leftIcon={Copy}
            aria-label="Copy path"
            title="Copy path"
            onClick={() => copy(row.path)}
          />
        </span>
      ),
    },
    {
      id: "hits",
      header: "Hits",
      type: "number",
      size: 90,
      align: "right",
      cell: (row) => <b className="text-fg">{row.hits.toLocaleString()}</b>,
    },
    {
      id: "redirect_target",
      header: "Redirect",
      type: "text",
      size: 230,
      cell: (row) => (row.redirect || row.ignored ? <RedirectInfo row={row} /> : muted),
    },
    {
      id: "last_seen_at",
      header: "Last seen",
      type: "date",
      size: 130,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.last_seen_at)}>
          {timeAgo(row.last_seen_at)}
        </span>
      ),
    },
    {
      id: "first_seen_at",
      header: "First seen",
      type: "date",
      size: 130,
      defaultHidden: true,
      cell: (row) => (
        <span className="text-fg-subtle whitespace-nowrap" title={formatDateTime(row.first_seen_at)}>
          {timeAgo(row.first_seen_at)}
        </span>
      ),
    },
    {
      id: "last_referrer",
      header: "Referrer",
      type: "text",
      size: 220,
      cell: (row) =>
        row.last_referrer ? (
          <span className="text-fg-muted text-xs" title={row.last_referrer}>
            {row.last_referrer}
          </span>
        ) : (
          <span className="text-fg-subtle">Direct</span>
        ),
    },
    {
      id: "last_user_agent",
      header: "User agent",
      type: "text",
      sortable: false,
      size: 220,
      defaultHidden: true,
      cell: (row) =>
        row.last_user_agent ? (
          <span className="text-fg-subtle text-xs" title={row.last_user_agent}>
            {row.last_user_agent}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "redirected",
      header: "Redirected",
      type: "bool",
      sortable: false,
      size: 110,
      defaultHidden: true,
      cell: (row) => (row.has_redirect ? "Yes" : "No"),
    },
    {
      id: "ignored",
      header: "Ignored",
      type: "bool",
      size: 100,
      defaultHidden: true,
      cell: (row) => (row.ignored ? "Yes" : "No"),
    },
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      size: 170,
      minSize: 90,
      align: "right",
      cell: rowActions,
    },
  ];

  const counts = data?.counts ?? stats;
  const filtered = !!list.search || grid.filters.length > 0;
  const emptyCopy: Record<UrlTab, string> = {
    open: "No broken links waiting for attention.",
    redirected: "No logged paths have an active redirect.",
    ignored: "Nothing has been ignored.",
    any: "Nothing has been logged yet. Visits to missing pages on the website appear here.",
  };

  return (
    <>
      <h1 className="sr-only">404 log</h1>
      <NotFoundKpis stats={stats} active={activeKpi} onSelect={selectKpi} />

      <Card>
        <Tabs<UrlTab>
          className="px-3 pt-1"
          value={tab}
          onChange={(v) => {
            selection.clear();
            list.setFilter("tab", v === "open" ? "" : v);
          }}
          tabs={[
            { value: "open", label: "Open", count: counts?.open },
            { value: "redirected", label: "Redirected", count: counts?.redirected },
            { value: "ignored", label: "Ignored", count: counts?.ignored },
            { value: "any", label: "All", count: counts?.all },
          ]}
        />
        <DataGrid
          id="not-found"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          fetching={isFetching}
          grid={grid}
          search={list.searchInput}
          onSearch={list.setSearchInput}
          searchPlaceholder="Search path or referrer…"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "path" : "paths"}
          actions={
            <>
              <TransferMenu
                compact
                type="not_found"
                queryKey={QK.NOT_FOUND}
                canExport={can(PERM.NOT_FOUND_VIEW)}
                canImport={false}
              />
              {canManage && !!counts?.all && (
                <Tooltip label="Clear the log" align="end">
                  <Button
                    variant="danger-outline"
                    iconOnly
                    leftIcon={Trash2}
                    aria-label="Clear the log"
                    onClick={clearAll}
                    className="h-9 w-9"
                  />
                </Tooltip>
              )}
            </>
          }
          selection={canManage ? selection : undefined}
          onRowClick={canRedirect ? (row) => !row.has_redirect && setRedirecting(row) : undefined}
          highlightId={redirecting?.id}
          renderListItem={(row, slots) => (
            <NotFoundListItem row={row} slots={slots} actions={rowActions(row)} />
          )}
          renderCard={(row, slots) => <NotFoundCard row={row} slots={slots} actions={rowActions(row)} />}
          empty={
            <EmptyState
              title={filtered ? "No entries match" : "All clear"}
              description={filtered ? "Try another tab, search or filter." : emptyCopy[tab]}
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="entries"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        {canManage && (
          <>
            {tab === "ignored" ? (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={Eye}
                onClick={() => run(() => notFoundApi.unignore(selection.ids), "Bulk action failed", true)}
              >
                Unignore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={EyeOff}
                onClick={() => run(() => notFoundApi.ignore(selection.ids), "Bulk action failed", true)}
              >
                Ignore
              </Button>
            )}
            <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => remove(selection.ids)}>
              Delete
            </Button>
          </>
        )}
      </BulkActionBar>

      <CreateRedirectModal
        log={redirecting}
        onClose={() => setRedirecting(null)}
        onSaved={() => {
          setRedirecting(null);
          refresh();
          queryClient.invalidateQueries({ queryKey: [QK.REDIRECTS] });
        }}
      />
    </>
  );
}
