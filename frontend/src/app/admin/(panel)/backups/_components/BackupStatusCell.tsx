"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/app/admin/_components/ui/index";
import { backupsApi, type Backup } from "@/app/admin/_lib/api/backupsApi";
import { formatBytes } from "@/lib/utils";

import { QK } from "@/config/query-keys";
export function BackupStatusCell({ backup }: { backup: Backup }) {
  const queryClient = useQueryClient();
  const running = backup.status === "running" && !backup.stalled;
  const [expanded, setExpanded] = useState(false);

  const { data: live } = useQuery({
    queryKey: [QK.BACKUPS, "show", backup.id],
    queryFn: () => backupsApi.get(backup.id),
    enabled: running,
    refetchInterval: (query) => (query.state.data && query.state.data.status !== "running" ? false : 2000),
  });

  const current = running && live ? live : backup;

  useEffect(() => {
    if (!running || !live || live.status === "running") return;
    if (live.status === "completed") toast.success(`Backup completed (${formatBytes(live.size)}).`);
    else toast.error(`Backup failed: ${live.error ?? "unknown error"}`);
    queryClient.invalidateQueries({ queryKey: [QK.BACKUPS] });
    queryClient.invalidateQueries({ queryKey: [QK.SYSTEM_HEALTH] });
  }, [running, live, queryClient]);

  if (current.status === "running") {
    if (current.stalled) {
      return (
        <div className="space-y-1">
          <Badge tone="warning" dot>
            Stalled
          </Badge>
          <p className="text-fg-subtle text-xs">The process stopped. Delete it and start a new backup.</p>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <Badge tone="info">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
        <p className="text-fg-subtle max-w-56 truncate text-xs">{current.stage ?? "Working…"}</p>
      </div>
    );
  }

  if (current.status === "failed") {
    const error = current.error ?? "The backup did not finish.";
    return (
      <div className="max-w-72 space-y-1">
        <Badge tone="danger" dot>
          Failed
        </Badge>
        <button
          type="button"
          title={error}
          onClick={() => setExpanded((v) => !v)}
          className="text-danger flex w-full items-start gap-1 text-left text-xs hover:underline"
        >
          <span className={expanded ? "break-words whitespace-pre-wrap" : "truncate"}>{error}</span>
          {expanded ? (
            <ChevronUp className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="mt-0.5 h-3 w-3 shrink-0" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Badge tone="success" dot>
        Completed
      </Badge>
      {current.note && <p className="text-fg-subtle text-xs">{current.note}</p>}
    </div>
  );
}
