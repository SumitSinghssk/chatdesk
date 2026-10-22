"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleCheck,
  Clock,
  Copy,
  FileText,
  LayoutGrid,
  Plus,
  RefreshCw,
  SquarePen,
  PlugZap,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  DataGrid,
  KpiGrid,
  KpiTile,
  ToolbarIconButton,
  useGridUrlState,
  type GridColumn,
} from "@/app/admin/_components/grid";
import { Badge, Button, Card, EmptyState, Pagination, RowActions } from "@/app/admin/_components/ui/index";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { Tooltip } from "../../_components/Tooltip";
import { INBOX_QK } from "../../_lib/inboxApi";
import { TEMPLATES_QK, templatesApi, type Template } from "../../_lib/templatesApi";
import { CATEGORIES, categoryLabel, LANGUAGES, languageName, QUALITY, STATUS, statusOf } from "./labels";
import { LibraryModal } from "./LibraryModal";
import { TemplateDetail } from "./TemplateDetail";

const GRID_ID = "ws-templates";
const muted = <span className="text-fg-faint">—</span>;

type Kpi = "all" | "approved" | "review" | "attention" | "draft";
const KPI_STATUS: Record<Kpi, string> = {
  all: "",
  approved: "approved",
  review: "pending,in_appeal",
  attention: "rejected,paused,disabled",
  draft: "draft",
};

/** One line of the message, without formatting marks, for the list. */
const snippet = (t: Template) =>
  (t.category === "authentication" ? "Verification code with a copy button" : t.form.body)
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function Templates() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useUrlListState({ filterKeys: ["status"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const params = { ...list.params, ...grid.apiParams };
  // While a template is in review, refresh often: Meta's webhook updates it within seconds
  const { data: stats } = useQuery({
    queryKey: TEMPLATES_QK.STATS,
    queryFn: async () => (await templatesApi.stats()).data,
    refetchInterval: (q) => (q.state.data?.pending ? 15_000 : false),
  });
  const waiting = !!stats?.pending;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: TEMPLATES_QK.LIST(params),
    queryFn: ({ signal }) => templatesApi.page(params, signal),
    placeholderData: (prev) => prev,
    refetchInterval: (q) =>
      waiting || q.state.data?.items.some((t) => t.status === "pending") ? 15_000 : false,
  });

  // Keep the copy in step with Meta: once on open, then every 30 s while something is in review
  // (a fallback for when the webhook isn't subscribed to template updates).
  const { data: autoSync } = useQuery({
    queryKey: ["templates", "auto-sync"],
    queryFn: async () => (await templatesApi.sync(true)).data,
    enabled: !!stats?.connected,
    refetchInterval: waiting ? 30_000 : false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (autoSync?.synced) {
      void queryClient.invalidateQueries({ queryKey: ["templates", "list"] });
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_QK.STATS });
    }
  }, [autoSync, queryClient]);

  // Tell the user when Meta decides (status changes between refreshes)
  const seen = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    for (const t of data?.items ?? []) {
      const before = seen.current.get(t.id);
      if (before && before !== t.status) {
        const label = `${t.name} is now ${statusOf(t.status).label.toLowerCase()}`;
        if (t.status === "approved") toast.success(label);
        else if (["rejected", "disabled", "paused"].includes(t.status)) toast.error(label);
        else toast(label);
      }
      seen.current.set(t.id, t.status);
    }
  }, [data]);

  const inPage = data?.items.find((t) => t.id === modal.editId);
  const { data: fetched } = useQuery({
    queryKey: TEMPLATES_QK.ONE(modal.editId ?? 0),
    queryFn: async () => (await templatesApi.get(modal.editId!)).data,
    enabled: !!modal.editId && !!data && !inPage,
  });
  const viewing = modal.editId ? (inPage ?? fetched ?? null) : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: TEMPLATES_QK.ALL });
    void queryClient.invalidateQueries({ queryKey: INBOX_QK.TEMPLATES });
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await templatesApi.sync();
      toast.success(res.message ?? "Synced with Meta");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (t: Template) => {
    const ok = await confirm({
      title: `Delete ${t.name}?`,
      message: t.meta_id
        ? "It's deleted from Meta too, and can't be sent any more. You can't reuse this name for 30 days."
        : "This draft is deleted. This can't be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await templatesApi.remove(t.id);
      toast.success(res.message ?? "Template deleted");
      if (modal.editId === t.id) modal.close();
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const activeKpi = list.search
    ? null
    : ((Object.keys(KPI_STATUS) as Kpi[]).find((k) => KPI_STATUS[k] === (list.filters.status ?? "")) ?? null);
  const selectKpi = (k: Kpi) => list.setFilter("status", KPI_STATUS[k]);

  const statusBadge = (t: Template) => {
    const s = statusOf(t.status);
    return (
      <Tooltip
        label={
          t.rejected_reason
            ? `${s.hint} Reason: ${t.rejected_reason.replace(/_/g, " ").toLowerCase()}`
            : s.hint
        }
      >
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      </Tooltip>
    );
  };

  const rowActions = (t: Template) => (
    <RowActions onDelete={() => remove(t)}>
      <Tooltip label="Duplicate">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={Copy}
          aria-label={`Duplicate ${t.name}`}
          onClick={() => router.push(CUSTOMER_ROUTES.TEMPLATE_NEW({ from: t.id }))}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
      <Tooltip label={t.editable ? "Edit" : `${statusOf(t.status).label} templates can't be edited`}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={SquarePen}
          aria-label={`Edit ${t.name}`}
          disabled={!t.editable}
          onClick={() => router.push(CUSTOMER_ROUTES.TEMPLATE_EDIT(t.id))}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
    </RowActions>
  );

  const columns: GridColumn<Template>[] = [
    {
      id: "name",
      header: "Template",
      type: "text",
      size: 320,
      alwaysVisible: true,
      cell: (t) => (
        <span className="block min-w-0">
          <span className="text-fg block truncate font-mono text-[13px] font-medium">{t.name}</span>
          <span className="text-fg-subtle block truncate text-xs">{snippet(t) || "—"}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      type: "enum",
      size: 130,
      options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
      cell: statusBadge,
    },
    {
      id: "category",
      header: "Category",
      type: "enum",
      size: 130,
      options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
      cell: (t) => <Badge>{categoryLabel(t.category)}</Badge>,
    },
    {
      id: "language",
      header: "Language",
      type: "enum",
      size: 140,
      options: (stats?.languages.length ? stats.languages : ["en"]).map((l) => ({
        value: l,
        label: LANGUAGES.find((x) => x.value === l)?.label ?? l,
      })),
      cell: (t) => <span className="whitespace-nowrap">{languageName(t.language)}</span>,
    },
    {
      id: "sent",
      header: "Sent",
      sortable: false,
      size: 120,
      cell: (t) =>
        t.stats.sent ? (
          <span className="whitespace-nowrap" title={`${t.stats.read} read, ${t.stats.failed} failed`}>
            <span className="tabular text-fg font-medium">{t.stats.sent}</span>
            <span className="text-fg-subtle text-xs">
              {" "}
              · {Math.round((t.stats.read / t.stats.sent) * 100)}% read
            </span>
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "quality",
      header: "Quality",
      type: "enum",
      size: 110,
      defaultHidden: true,
      options: Object.entries(QUALITY).map(([value, q]) => ({ value, label: q.label })),
      cell: (t) =>
        t.quality && QUALITY[t.quality] ? (
          <Badge tone={QUALITY[t.quality].tone}>{QUALITY[t.quality].label}</Badge>
        ) : (
          muted
        ),
    },
    {
      id: "source",
      header: "Made in",
      type: "enum",
      size: 150,
      defaultHidden: true,
      options: [
        { value: "app", label: "ChatDesk" },
        { value: "meta", label: "WhatsApp Manager" },
      ],
      cell: (t) => (t.source === "meta" ? "WhatsApp Manager" : "ChatDesk"),
    },
    {
      id: "updated_at",
      header: "Updated",
      type: "date",
      size: 120,
      cell: (t) => (
        <span title={formatDateTime(t.updated_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(t.updated_at)}
        </span>
      ),
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

  return (
    <>
      <h1 className="sr-only">Templates</h1>

      {stats && !stats.connected && (
        <div className="border-warning/30 bg-warning-soft mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
          <PlugZap className="text-warning h-5 w-5 shrink-0" />
          <p className="text-fg min-w-0 flex-1">
            <span className="font-semibold">Connect WhatsApp to sync and submit templates.</span>{" "}
            <span className="text-fg-subtle">You can still write drafts now.</span>
          </p>
          <Link href={CUSTOMER_ROUTES.WHATSAPP()}>
            <Button size="sm">Connect</Button>
          </Link>
        </div>
      )}

      <KpiGrid cols={5}>
        <KpiTile
          icon={FileText}
          tone="green"
          label="All templates"
          value={stats?.total}
          hint={stats?.synced_at ? `Synced ${timeAgo(stats.synced_at)}` : "Not synced yet"}
          active={activeKpi === "all"}
          onClick={() => selectKpi("all")}
        />
        <KpiTile
          icon={CircleCheck}
          tone="blue"
          label="Approved"
          value={stats?.approved}
          hint="Ready to send"
          active={activeKpi === "approved"}
          onClick={() => selectKpi("approved")}
        />
        <KpiTile
          icon={Clock}
          tone={stats?.pending ? "amber" : "slate"}
          label="In review"
          value={stats?.pending}
          hint="Waiting for Meta"
          active={activeKpi === "review"}
          onClick={() => selectKpi("review")}
        />
        <KpiTile
          icon={AlertTriangle}
          tone={stats && stats.rejected + stats.paused ? "red" : "slate"}
          label="Needs attention"
          value={stats ? stats.rejected + stats.paused : undefined}
          hint="Rejected or paused"
          active={activeKpi === "attention"}
          onClick={() => selectKpi("attention")}
        />
        <KpiTile
          icon={SquarePen}
          tone="purple"
          label="Drafts"
          value={stats?.draft}
          hint="Not submitted"
          active={activeKpi === "draft"}
          onClick={() => selectKpi("draft")}
        />
      </KpiGrid>

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
          searchPlaceholder="Search name or text"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "template" : "templates"}
          actions={
            <>
              <ToolbarIconButton
                icon={RefreshCw}
                label={syncing ? "Syncing…" : "Sync with Meta"}
                onClick={sync}
              />
              <ToolbarIconButton
                icon={LayoutGrid}
                label="Template library"
                tooltipAlign="end"
                onClick={() => setLibraryOpen(true)}
              />
              <Tooltip label="New template" align="end">
                <Button
                  iconOnly
                  leftIcon={Plus}
                  aria-label="New template"
                  onClick={() => router.push(CUSTOMER_ROUTES.TEMPLATE_NEW())}
                  className="h-9 w-9"
                />
              </Tooltip>
            </>
          }
          onRowClick={(row) => modal.openEdit(row.id)}
          highlightId={modal.focusId ?? modal.editId}
          renderListItem={(t) => (
            <div className="flex items-center gap-3">
              <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate font-mono text-sm font-semibold">{t.name}</p>
                <p className="text-fg-subtle truncate text-xs">{snippet(t)}</p>
              </div>
              <span className="hidden shrink-0 sm:block">{statusBadge(t)}</span>
              <span className="shrink-0">{rowActions(t)}</span>
            </div>
          )}
          renderCard={(t) => (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-fg min-w-0 truncate font-mono text-sm font-semibold">{t.name}</p>
                {statusBadge(t)}
              </div>
              <p className="text-fg-subtle mt-2 line-clamp-3 min-h-12 text-xs">{snippet(t)}</p>
              <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-fg-subtle text-xs">
                  {categoryLabel(t.category)} · {languageName(t.language)}
                </span>
                {rowActions(t)}
              </div>
            </>
          )}
          empty={
            <EmptyState
              icon={FileText}
              title={filtered ? "No templates match" : "No templates yet"}
              description={
                filtered
                  ? "Try a different search or filter."
                  : "Templates are messages Meta approves in advance. You need them to start chats and send campaigns. Start from the library or write your own."
              }
              action={
                !filtered && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" leftIcon={LayoutGrid} onClick={() => setLibraryOpen(true)}>
                      Browse library
                    </Button>
                    <Button leftIcon={Plus} onClick={() => router.push(CUSTOMER_ROUTES.TEMPLATE_NEW())}>
                      New template
                    </Button>
                  </div>
                )
              }
            />
          }
          footer={
            <Pagination
              meta={data?.meta}
              onPageChange={list.setPage}
              onPerPageChange={list.setPerPage}
              unit="templates"
            />
          }
        />
      </Card>

      <TemplateDetail template={viewing} onClose={modal.close} onDelete={remove} />
      <LibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </>
  );
}
