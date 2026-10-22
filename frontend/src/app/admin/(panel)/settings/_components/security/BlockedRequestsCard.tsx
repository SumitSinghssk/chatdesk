"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, List, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  FilterSelect,
  ListToolbar,
  Pagination,
  type Column,
} from "@/app/admin/_components/ui/index";
import { useDebouncedValue } from "@/app/admin/_hooks/useDebouncedValue";
import { securityApi, type BlockedRequest } from "@/app/admin/_lib/api/securityApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { formatDateTime, timeAgo } from "@/lib/utils";

import { BLOCKS_KEY, useIpBlocks } from "./BlockedIpsCard";

import { QK } from "@/config/query-keys";
const REASON_LABELS: Record<string, string> = {
  blocked_ip: "Blocked IP",
  rate_limited: "Too many requests",
};

export function BlockedRequestsCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const params = { page, per_page: perPage, search: debounced, reason };

  const { data, isLoading } = useQuery({
    queryKey: [QK.SECURITY, "requests", params],
    queryFn: ({ signal }) => securityApi.requests(params, signal),
    placeholderData: (prev) => prev,
  });
  const { data: blocks } = useIpBlocks();
  const activeIps = new Set((blocks?.items ?? []).filter((b) => !b.expired).map((b) => b.ip));
  const reasons = { ...REASON_LABELS, ...(data?.reasons ?? {}) };
  const reasonOptions = [
    { value: "", label: "All reasons" },
    ...Object.entries(reasons).map(([value, label]) => ({ value, label })),
  ];
  const hasFilters = !!(search || reason);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.SECURITY] });

  const quickBlock = async (row: BlockedRequest) => {
    const ok = await confirm({
      title: `Block ${row.ip}?`,
      message: "Blocks this address for 1 day. You can change or remove it under Blocked IP addresses.",
      confirmLabel: "Block for 1 day",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await securityApi.block({
        ip: row.ip,
        duration: "1d",
        reason: `From the blocked-requests log (${row.reason_label})`,
      });
      toast.success(res.message ?? "IP blocked");
      queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't block that address"));
    }
  };

  const clearLog = async () => {
    const ok = await confirm({
      title: "Clear the blocked-requests log?",
      message: "This only clears the history. Blocked IPs stay blocked.",
      confirmLabel: "Clear log",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await securityApi.clearRequests();
      toast.success(res.message ?? "Log cleared");
      setPage(1);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't clear the log"));
    }
  };

  const columns: Column<BlockedRequest>[] = [
    {
      key: "time",
      header: "Time",
      cell: (row) => (
        <time className="text-fg-subtle text-xs whitespace-nowrap" title={formatDateTime(row.created_at)}>
          {timeAgo(row.created_at)}
        </time>
      ),
    },
    {
      key: "ip",
      header: "IP address",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-fg font-mono text-sm">{row.ip}</span>
          {canEdit && !activeIps.has(row.ip) && row.ip !== blocks?.yourIp && (
            <Button
              size="xs"
              variant="ghost"
              leftIcon={Ban}
              onClick={() => quickBlock(row)}
              title={`Block ${row.ip}`}
              className="text-fg-faint hover:text-danger"
            >
              Block
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (row) => (
        <Badge tone={row.reason === "blocked_ip" ? "danger" : "warning"}>{row.reason_label}</Badge>
      ),
    },
    {
      key: "request",
      header: "Request",
      cell: (row) => (
        <span
          className="text-fg-muted block max-w-xs truncate text-xs"
          title={`${row.method ?? ""} ${row.path ?? ""}`}
        >
          <span className="font-semibold">{row.method}</span> {row.path}
        </span>
      ),
    },
    {
      key: "agent",
      header: "User agent",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-fg-subtle block max-w-56 truncate text-xs" title={row.user_agent ?? ""}>
          {row.user_agent || "—"}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Blocked requests"
        icon={List}
        description="What was stopped recently, and why."
        actions={
          canEdit &&
          (data?.meta.total ?? 0) > 0 && (
            <Button size="sm" variant="secondary" leftIcon={Trash2} onClick={clearLog}>
              Clear log
            </Button>
          )
        }
      />

      <dl className="border-line bg-line grid grid-cols-2 gap-px border-b sm:grid-cols-4">
        {Object.entries(reasons).map(([key, label]) => (
          <div key={key} className="bg-surface px-4 py-3">
            <dt className="text-fg-subtle text-[11px]">{label}</dt>
            <dd className="tabular text-fg text-lg font-semibold">
              {(data?.summary[key] ?? 0).toLocaleString()}
            </dd>
          </div>
        ))}
        <div className="bg-surface text-fg-faint col-span-2 flex items-end px-4 py-3 text-xs sm:col-span-2">
          Counts for the last 24 hours.
        </div>
      </dl>

      <ListToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search IP or path…"
        showReset={hasFilters}
        onReset={() => {
          setSearch("");
          setReason("");
          setPage(1);
        }}
      >
        <FilterSelect
          label="Reason"
          value={reason}
          onChange={(v) => {
            setReason(v);
            setPage(1);
          }}
          options={reasonOptions}
        />
      </ListToolbar>

      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(r) => r.id}
        loading={isLoading}
        empty={
          <EmptyState
            title={hasFilters ? "No blocked requests match" : "Nothing has been blocked yet"}
            description={
              hasFilters
                ? "Try a different search or reason."
                : "Requests refused by the firewall or rate limits show up here."
            }
          />
        }
      />
      <Pagination
        meta={data?.meta}
        onPageChange={setPage}
        onPerPageChange={(n) => {
          setPerPage(n);
          setPage(1);
        }}
        unit="requests"
      />
    </Card>
  );
}
