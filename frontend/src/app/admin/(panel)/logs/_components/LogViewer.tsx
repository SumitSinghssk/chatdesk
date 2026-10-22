"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw, ScrollText, Trash2 } from "lucide-react";

import { Button, EmptyState, FilterSelect, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { logsApi } from "@/app/admin/_lib/api/logsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn, formatBytes } from "@/lib/utils";

import { QK } from "@/config/query-keys";
const LINE_OPTIONS = [200, 500, 1000, 5000].map((n) => ({
  value: String(n),
  label: `Last ${n.toLocaleString()} lines`,
}));

export function LogViewer({
  name,
  lines,
  onLines,
  onClose,
  onDelete,
}: {
  name: string | null;
  lines: number;
  onLines: (n: number) => void;
  onClose: () => void;
  onDelete?: (name: string) => void;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const content = useQuery({
    queryKey: [QK.LOGS, name, lines],
    queryFn: ({ signal }) => logsApi.read(name!, lines, signal),
    enabled: !!name,
  });

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [content.data]);

  return (
    <Modal
      open={!!name}
      onClose={onClose}
      size="2xl"
      title={name ?? ""}
      description={
        content.data
          ? `Showing ${content.data.line_count.toLocaleString()} line(s) · ${formatBytes(content.data.size)}`
          : "Latest entries"
      }
      bodyClassName="p-0 flex flex-col"
      headerActions={
        <>
          <FilterSelect
            label="Lines to show"
            value={String(lines)}
            onChange={(v) => onLines(Number(v) || 500)}
            options={LINE_OPTIONS}
          />
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            leftIcon={RefreshCw}
            aria-label="Refresh"
            title="Refresh"
            loading={content.isFetching}
            onClick={() => content.refetch()}
          />
          {onDelete && name && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leftIcon={Trash2}
              aria-label={`Delete ${name}`}
              title="Delete file"
              className="hover:bg-danger-soft hover:text-danger"
              onClick={() => onDelete(name)}
            />
          )}
        </>
      }
    >
      {content.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${60 + ((i * 17) % 40)}%` }} />
          ))}
        </div>
      ) : content.isError ? (
        <EmptyState
          icon={ScrollText}
          title="Couldn't load this file"
          description={apiErrorMessage(content.error)}
        />
      ) : content.data && content.data.lines.length === 0 ? (
        <EmptyState icon={FileText} title="This file is empty" />
      ) : (
        <pre
          ref={preRef}
          tabIndex={0}
          aria-label={`Contents of ${name}`}
          className="bg-page text-fg min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre"
        >
          {content.data?.lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                /\b(ERROR|CRITICAL|Traceback)\b/.test(line) && "text-danger",
                /\bWARNING\b/.test(line) && "text-warning"
              )}
            >
              {line || " "}
            </div>
          ))}
        </pre>
      )}
    </Modal>
  );
}
