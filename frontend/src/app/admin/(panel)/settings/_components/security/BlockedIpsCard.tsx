"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Plus, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Badge, Button, Card, CardHeader, Input, Select, Skeleton } from "@/app/admin/_components/ui/index";
import {
  BLOCK_DURATION_OPTIONS,
  securityApi,
  type BlockDuration,
  type IpBlock,
} from "@/app/admin/_lib/api/securityApi";
import { apiErrorMessage, apiFieldErrors } from "@/app/admin/_lib/api/errors";
import { formatDateTime, timeAgo } from "@/lib/utils";

export const BLOCKS_KEY = ["security", "blocks"] as const;

export function useIpBlocks() {
  return useQuery({ queryKey: BLOCKS_KEY, queryFn: securityApi.blocks, staleTime: 15_000 });
}

export function BlockedIpsCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useIpBlocks();
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<BlockDuration>("forever");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const blocks = data?.items ?? [];
  const active = blocks.filter((b) => !b.expired);

  const create = useMutation({
    mutationFn: () => securityApi.block({ ip: ip.trim(), reason: reason.trim() || null, duration }),
    onSuccess: (res) => {
      toast.success(res.message ?? "IP blocked");
      setIp("");
      setReason("");
      setErrors({});
      queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
    },
    onError: (err) => {
      const fields = apiFieldErrors(err);
      setErrors(fields);
      if (!fields.ip) toast.error(apiErrorMessage(err, "Couldn't block that address"));
    },
  });

  const remove = async (block: IpBlock) => {
    const ok = await confirm({
      title: `Unblock ${block.ip}?`,
      message: "Visitors from this address can use the site again straight away.",
      confirmLabel: "Unblock",
      variant: "warning",
    });
    if (!ok) return;
    try {
      const res = await securityApi.unblock(block.id);
      toast.success(res.message ?? "Unblocked");
      queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't unblock"));
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) {
      setErrors({ ip: "Enter an IP address or range" });
      return;
    }
    create.mutate();
  };

  return (
    <Card>
      <CardHeader
        title="Blocked IP addresses"
        icon={Ban}
        badge={isLoading ? undefined : String(active.length)}
        description="Anyone from these addresses gets “Access denied” on the whole site and the API."
      />

      {canEdit && (
        <form
          onSubmit={onSubmit}
          noValidate
          className="border-line grid grid-cols-1 items-start gap-3 border-b p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem_auto]"
        >
          <Input
            label="IP address or range"
            placeholder="203.0.113.7 or 203.0.113.0/24"
            autoComplete="off"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            error={errors.ip}
          />
          <Input
            label="Reason"
            placeholder="Optional"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            error={errors.reason}
          />
          <Select
            label="Block for"
            value={duration}
            onChange={(v) => setDuration(v as BlockDuration)}
            options={BLOCK_DURATION_OPTIONS}
          />
          <div className="lg:pt-6.5">
            <Button type="submit" leftIcon={Plus} loading={create.isPending} fullWidth>
              Block
            </Button>
          </div>
          {data?.yourIp && (
            <p className="text-fg-subtle text-xs sm:col-span-2 lg:col-span-4">
              Your IP: <span className="text-fg-muted font-mono">{data.yourIp}</span> — you can&apos;t block
              yourself.
            </p>
          )}
        </form>
      )}

      {isLoading ? (
        <div className="space-y-2 p-4 sm:p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <ShieldOff className="text-fg-faint h-6 w-6" />
          <p className="text-fg-subtle text-sm">No IP addresses are blocked.</p>
        </div>
      ) : (
        <ul className="divide-line divide-y">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-fg font-mono font-medium">{block.ip}</span>
                  {block.automatic ? (
                    <Badge tone="warning">Automatic</Badge>
                  ) : (
                    <Badge tone="neutral">Manual</Badge>
                  )}
                  {block.expired && <Badge tone="neutral">Expired</Badge>}
                </p>
                <p className="text-fg-subtle mt-0.5 text-xs">
                  {block.reason || "No reason given"}
                  {" · "}
                  {block.expires_at ? (
                    <span title={formatDateTime(block.expires_at)}>
                      {block.expired ? "expired " : "until "}
                      {formatDateTime(block.expires_at)}
                    </span>
                  ) : (
                    "Forever"
                  )}
                  {" · added "}
                  <span title={formatDateTime(block.created_at)}>{timeAgo(block.created_at)}</span>
                  {block.created_by?.name && <> by {block.created_by.name}</>}
                  {block.hits > 0 && (
                    <>
                      {" · "}
                      <span className="tabular">{block.hits.toLocaleString()}</span>{" "}
                      {block.hits === 1 ? "visit" : "visits"} stopped
                      {block.last_hit_at && <>, last {timeAgo(block.last_hit_at)}</>}
                    </>
                  )}
                </p>
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" leftIcon={X} onClick={() => remove(block)}>
                  {block.expired ? "Remove" : "Unblock"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
