"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Download,
  MessageCircle,
  MessageCircleOff,
  Plus,
  Tag,
  TagsIcon,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  DataGrid,
  KpiGrid,
  KpiTile,
  TrendHint,
  useGridUrlState,
  type FilterRule,
  type GridColumn,
} from "@/app/admin/_components/grid";
import {
  Avatar,
  Badge,
  Button,
  BulkActionBar,
  Card,
  Dropdown,
  EmptyState,
  PageHeader,
  Pagination,
  RowActions,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { useBulkSelection } from "@/app/admin/_hooks/useBulkSelection";
import { useUrlListState } from "@/app/admin/_hooks/useUrlListState";
import { useUrlModal } from "@/app/admin/_hooks/useUrlModal";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { CONTACTS_QK, contactsApi, type BulkContactAction, type Contact } from "../../_lib/contactsApi";
import { inboxApi } from "../../_lib/inboxApi";
import { ContactModal } from "./ContactModal";
import { ImportModal } from "./ImportModal";
import { TagBulkModal } from "./TagBulkModal";

const GRID_ID = "ws-contacts";
const SOURCE_LABELS: Record<string, string> = {
  inbox: "WhatsApp chat",
  manual: "Added by hand",
  import: "CSV import",
  api: "API",
};
const SOURCE_OPTIONS = Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }));
const muted = <span className="text-fg-faint">—</span>;

type Kpi = "all" | "new" | "active" | "opted_out" | "blocked";

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
const KPI_RULES: Record<Kpi, () => FilterRule[]> = {
  all: () => [],
  new: () => [rule("created_at", "after", daysAgo(7))],
  active: () => [rule("last_message_at", "after", daysAgo(30))],
  opted_out: () => [rule("opted_out", "is_true")],
  blocked: () => [rule("blocked", "is_true")],
};
const signature = (rules: FilterRule[]) =>
  JSON.stringify(rules.map(({ field, op, value }) => [field, op, value]));

export function Contacts() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useUrlListState({ filterKeys: ["tag"] });
  const grid = useGridUrlState();
  const modal = useUrlModal();
  const selection = useBulkSelection();
  const [importOpen, setImportOpen] = useState(false);
  const [tagMode, setTagMode] = useState<"add_tag" | "remove_tag" | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const params = { ...list.params, ...grid.apiParams };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: CONTACTS_QK.LIST(params),
    queryFn: ({ signal }) => contactsApi.page(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: CONTACTS_QK.STATS,
    queryFn: async () => (await contactsApi.stats()).data,
  });
  const inPage = data?.items.find((c) => c.id === modal.editId);
  const { data: fetched } = useQuery({
    queryKey: CONTACTS_QK.ONE(modal.editId ?? 0),
    queryFn: async () => (await contactsApi.get(modal.editId!)).data,
    enabled: !!modal.editId && !!data && !inPage,
  });
  const editing = modal.editId ? (inPage ?? fetched ?? null) : null;
  const tagNames = (stats?.tags ?? []).map((t) => t.tag);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: CONTACTS_QK.ALL });
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
  };

  const current = signature(grid.filters);
  const activeKpi =
    list.filters.tag || list.search
      ? null
      : ((Object.keys(KPI_RULES) as Kpi[]).find((k) => signature(KPI_RULES[k]()) === current) ?? null);
  const selectKpi = (kpi: Kpi) => {
    selection.clear();
    grid.setFiltersWith(KPI_RULES[kpi](), { tag: null, search: null });
  };

  const openChat = async (c: Contact) => {
    if (c.conversation) {
      router.push(CUSTOMER_ROUTES.INBOX({ c: c.conversation.id }));
      return;
    }
    setOpening(c.id);
    try {
      const res = await inboxApi.start({ phone: c.wa_id });
      router.push(CUSTOMER_ROUTES.INBOX({ c: res.data.id }));
    } catch (err) {
      toast.error(errorMessage(err));
      setOpening(null);
    }
  };

  const remove = async (c: Contact) => {
    const ok = await confirm({
      title: `Delete ${c.display_name}?`,
      message: c.conversation
        ? "Their chat history in the inbox is deleted too. This can't be undone."
        : "This can't be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await contactsApi.remove(c.id);
      toast.success(res.message ?? "Contact deleted");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const runBulk = async (action: BulkContactAction, tag?: string) => {
    if (action === "delete") {
      const ok = await confirm({
        title: `Delete ${selection.count} contact${selection.count === 1 ? "" : "s"}?`,
        message: "Their chat history is deleted too. This can't be undone.",
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) return;
    }
    try {
      const res = await contactsApi.bulk(selection.ids, action, tag);
      toast.success(res.message ?? "Done");
      selection.clear();
      setTagMode(null);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const exportParams = {
    search: list.search || undefined,
    tag: list.filters.tag || undefined,
    ...grid.apiParams,
  };

  const rowActions = (c: Contact) => (
    <RowActions onEdit={() => modal.openEdit(c.id)} onDelete={() => remove(c)}>
      <Tooltip label={c.conversation ? "Open chat" : "Start chat"}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={MessageCircle}
          aria-label={`Chat with ${c.display_name}`}
          loading={opening === c.id}
          onClick={() => openChat(c)}
          className="text-fg-faint hover:bg-primary-soft hover:text-primary"
        />
      </Tooltip>
    </RowActions>
  );

  const tagChips = (c: Contact) =>
    c.tags.length ? (
      <span className="flex flex-wrap gap-1">
        {c.tags.slice(0, 3).map((t) => (
          <Badge key={t} tone="info">
            {t}
          </Badge>
        ))}
        {c.tags.length > 3 && <Badge>+{c.tags.length - 3}</Badge>}
      </span>
    ) : (
      muted
    );

  const columns: GridColumn<Contact>[] = [
    {
      id: "name",
      header: "Contact",
      type: "text",
      size: 240,
      alwaysVisible: true,
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={c.display_name} size={28} />
          <span className="min-w-0">
            <span className="text-fg block truncate font-medium">{c.display_name}</span>
            {c.name && c.profile_name && c.profile_name !== c.name && (
              <span className="text-fg-subtle block truncate text-xs">~ {c.profile_name}</span>
            )}
          </span>
        </span>
      ),
    },
    {
      id: "wa_id",
      header: "WhatsApp",
      type: "text",
      size: 160,
      cell: (c) => <span className="whitespace-nowrap">{c.phone}</span>,
    },
    { id: "tags", header: "Tags", sortable: false, size: 200, cell: tagChips },
    {
      id: "last_message_at",
      header: "Last message",
      type: "date",
      size: 140,
      cell: (c) =>
        c.last_message_at ? (
          <span title={formatDateTime(c.last_message_at)} className="text-fg-subtle whitespace-nowrap">
            {timeAgo(c.last_message_at)}
          </span>
        ) : (
          muted
        ),
    },
    {
      id: "opted_out",
      header: "Marketing",
      type: "bool",
      size: 120,
      cell: (c) =>
        c.blocked ? (
          <Badge tone="danger" dot>
            Blocked
          </Badge>
        ) : c.opted_out ? (
          <Badge tone="warning" dot>
            Opted out
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Subscribed
          </Badge>
        ),
    },
    {
      id: "email",
      header: "Email",
      type: "text",
      size: 210,
      defaultHidden: true,
      cell: (c) => c.email ?? muted,
    },
    {
      id: "source",
      header: "Added via",
      type: "enum",
      size: 140,
      options: SOURCE_OPTIONS,
      defaultHidden: true,
      cell: (c) => <Badge>{SOURCE_LABELS[c.source] ?? c.source}</Badge>,
    },
    {
      id: "blocked",
      header: "Blocked",
      type: "bool",
      size: 100,
      defaultHidden: true,
      cell: (c) => (c.blocked ? "Yes" : muted),
    },
    {
      id: "created_at",
      header: "Added",
      type: "date",
      size: 130,
      cell: (c) => (
        <span title={formatDateTime(c.created_at)} className="text-fg-subtle whitespace-nowrap">
          {timeAgo(c.created_at)}
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

  return (
    <>
      <PageHeader
        icon={Users}
        title="Contacts"
        count={stats?.total}
        description="Everyone you can message on WhatsApp, with tags, custom fields and opt-in status."
        actions={
          <>
            <Button variant="secondary" leftIcon={Upload} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button
              variant="secondary"
              leftIcon={Download}
              href={contactsApi.exportUrl(exportParams)}
              target="_blank"
            >
              Export
            </Button>
            <Button leftIcon={UserPlus} onClick={modal.openCreate}>
              Add contact
            </Button>
          </>
        }
      />

      <KpiGrid cols={5}>
        <KpiTile
          icon={Users}
          tone="green"
          label="All contacts"
          value={stats?.total}
          hint={
            stats && (
              <TrendHint
                current={stats.new_7d}
                previous={stats.prev_7d}
                suffix={`${stats.new_7d} new in 7 days`}
              />
            )
          }
          active={activeKpi === "all"}
          onClick={() => selectKpi("all")}
        />
        <KpiTile
          icon={UserPlus}
          tone="blue"
          label="New this week"
          value={stats?.new_7d}
          hint="Added in the last 7 days"
          active={activeKpi === "new"}
          onClick={() => selectKpi("new")}
        />
        <KpiTile
          icon={UserCheck}
          tone="purple"
          label="Active in 30 days"
          value={stats?.active_30d}
          hint="Chatted recently"
          active={activeKpi === "active"}
          onClick={() => selectKpi("active")}
        />
        <KpiTile
          icon={MessageCircleOff}
          tone={stats?.opted_out ? "amber" : "slate"}
          label="Opted out"
          value={stats?.opted_out}
          hint="No marketing templates"
          active={activeKpi === "opted_out"}
          onClick={() => selectKpi("opted_out")}
        />
        <KpiTile
          icon={Ban}
          tone={stats?.blocked ? "red" : "slate"}
          label="Blocked"
          value={stats?.blocked}
          hint="No replies"
          active={activeKpi === "blocked"}
          onClick={() => selectKpi("blocked")}
        />
      </KpiGrid>

      {!!stats?.tags.length && (
        <div
          className="no-scrollbar mb-3 flex items-center gap-1.5 overflow-x-auto"
          role="group"
          aria-label="Filter by tag"
        >
          <TagsIcon className="text-fg-faint h-4 w-4 shrink-0" aria-hidden />
          {stats.tags.slice(0, 20).map(({ tag, count }) => {
            const on = list.filters.tag === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => list.setFilter("tag", on ? "" : tag)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition",
                  on
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-line bg-surface text-fg-subtle hover:text-fg"
                )}
              >
                {tag} <span className="tabular opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

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
          searchPlaceholder="Search name, number or email"
          count={data?.meta.total}
          countLabel={data?.meta.total === 1 ? "contact" : "contacts"}
          actions={
            <Tooltip label="Add contact" align="end">
              <Button
                iconOnly
                leftIcon={Plus}
                aria-label="Add contact"
                onClick={modal.openCreate}
                className="h-9 w-9"
              />
            </Tooltip>
          }
          selection={selection}
          onRowClick={(row) => modal.openEdit(row.id)}
          highlightId={modal.focusId ?? modal.editId}
          renderListItem={(c, slots) => (
            <div className="flex items-center gap-3">
              {slots.checkbox}
              <Avatar name={c.display_name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate font-semibold">{c.display_name}</p>
                <p className="text-fg-subtle truncate text-xs">
                  {[c.phone, c.email, c.last_message_at ? `last message ${timeAgo(c.last_message_at)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="hidden shrink-0 md:block">{tagChips(c)}</span>
              <span className="shrink-0">{rowActions(c)}</span>
            </div>
          )}
          renderCard={(c, slots) => (
            <>
              <div className="relative flex flex-col items-center text-center">
                <span className="absolute top-0 right-0">{slots.checkbox}</span>
                <Avatar name={c.display_name} size={56} />
                <p className="text-fg mt-3 line-clamp-1 font-semibold">{c.display_name}</p>
                <p className="text-fg-subtle text-xs">{c.phone}</p>
                <div className="mt-2 flex min-h-5 flex-wrap justify-center gap-1">{tagChips(c)}</div>
              </div>
              <div className="border-line mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-fg-subtle text-xs">
                  {c.last_message_at ? timeAgo(c.last_message_at) : "No messages"}
                </span>
                {rowActions(c)}
              </div>
            </>
          )}
          empty={
            <EmptyState
              icon={Users}
              title={list.hasFilters || grid.filters.length ? "No contacts match" : "No contacts yet"}
              description={
                list.hasFilters || grid.filters.length
                  ? "Try a different search, tag or filter."
                  : "People who message your WhatsApp number appear here automatically. You can also import a CSV or add them by hand."
              }
              action={
                !(list.hasFilters || grid.filters.length) && (
                  <Button leftIcon={Upload} onClick={() => setImportOpen(true)}>
                    Import contacts
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
              unit="contacts"
            />
          }
        />
      </Card>

      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button size="sm" variant="secondary" leftIcon={Tag} onClick={() => setTagMode("add_tag")}>
          Add tag
        </Button>
        <Dropdown
          align="right"
          width="w-48"
          trigger={() => (
            <Button size="sm" variant="secondary">
              More
            </Button>
          )}
          items={[
            { label: "Remove a tag", icon: Tag, onClick: () => setTagMode("remove_tag") },
            { label: "Mark opted out", icon: MessageCircleOff, onClick: () => runBulk("opt_out") },
            { label: "Mark subscribed", icon: MessageCircle, onClick: () => runBulk("opt_in") },
            { label: "Block", icon: Ban, onClick: () => runBulk("block") },
            { label: "Unblock", icon: UserCheck, onClick: () => runBulk("unblock") },
          ]}
        />
        <Button size="sm" variant="danger" leftIcon={Trash2} onClick={() => runBulk("delete")}>
          Delete
        </Button>
      </BulkActionBar>

      <ContactModal
        key={editing?.id ?? (modal.isCreate ? "new" : "closed")}
        open={modal.isCreate || !!editing}
        contact={editing}
        tagSuggestions={tagNames}
        onClose={modal.close}
        onSaved={() => {
          modal.close();
          refresh();
        }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refresh} />
      <TagBulkModal
        mode={tagMode}
        count={selection.count}
        suggestions={tagNames}
        onClose={() => setTagMode(null)}
        onApply={(tag) => runBulk(tagMode!, tag)}
      />
    </>
  );
}
