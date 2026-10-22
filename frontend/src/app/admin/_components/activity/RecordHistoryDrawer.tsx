"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, History } from "lucide-react";

import { Avatar, Button, EmptyState, ErrorBanner, Modal, Skeleton } from "@/app/admin/_components/ui/index";
import { activityLogsApi, type ActivityLog } from "@/app/admin/_lib/api/activityLogsApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { useHistoryStore } from "@/app/admin/_store/historyStore";
import { QK } from "@/config/query-keys";
import { cn, formatDateTime, timeAgo, titleCase } from "@/lib/utils";

import { ActionBadge, actionLabel } from "./ActionBadge";
import { ChangesTable, hasChanges } from "./ChangesTable";

const PER_PAGE = 20;

export function RecordHistoryDrawer() {
  const { subject, close } = useHistoryStore();

  return (
    <Modal
      open={!!subject}
      onClose={close}
      variant="drawer"
      size="lg"
      title={
        subject ? `History · ${subject.label ?? `${titleCase(subject.type)} #${subject.id}`}` : "History"
      }
      description="Who changed this record, when, and what changed."
      bodyClassName="bg-page"
    >
      {subject && <HistoryList key={`${subject.type}:${subject.id}`} type={subject.type} id={subject.id} />}
    </Modal>
  );
}

function HistoryList({ type, id }: { type: string; id: number }) {
  const query = useInfiniteQuery({
    queryKey: [QK.ACTIVITY_LOGS, "history", type, id],
    queryFn: ({ pageParam, signal }) =>
      activityLogsApi.page(
        { subject_type: type, subject_id: id, page: pageParam, per_page: PER_PAGE },
        signal
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined),
  });

  if (query.isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  if (query.error)
    return <ErrorBanner message={apiErrorMessage(query.error, "Could not load the history.")} />;

  const entries = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;
  if (!entries.length)
    return (
      <EmptyState
        icon={History}
        title="No history yet"
        description="Changes to this record will show up here."
      />
    );

  return (
    <div>
      <p className="text-fg-subtle mb-3 text-xs">
        {total} {total === 1 ? "entry" : "entries"}, newest first
      </p>
      <ol className="border-line ml-3 space-y-3 border-l pl-5">
        {entries.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </ol>
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            Load older entries
          </Button>
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry }: { entry: ActivityLog }) {
  const [open, setOpen] = useState(false);
  const changes = hasChanges(entry.old_values, entry.new_values);
  const who = entry.user?.name ?? entry.user_email ?? "System";

  return (
    <li className="relative">
      <span className="absolute top-3 -left-[33px] rounded-full">
        <Avatar name={who} size={24} />
      </span>
      <div className="border-line bg-surface rounded-xl border p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-fg text-sm font-semibold">{who}</span>
          <ActionBadge action={entry.action} />
          <time
            dateTime={entry.created_at}
            title={formatDateTime(entry.created_at)}
            className="text-fg-subtle ml-auto text-xs"
          >
            {timeAgo(entry.created_at)}
          </time>
        </div>
        <p className="text-fg-muted mt-1 text-sm">{entry.description || actionLabel(entry.action)}</p>
        <p className="text-fg-faint mt-1 text-[11px]">
          {[formatDateTime(entry.created_at), entry.ip_address, entry.browser].filter(Boolean).join(" · ")}
        </p>
        {changes && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
              {open ? "Hide changes" : "Show changes"}
            </button>
            {open && (
              <div className="mt-2">
                <ChangesTable oldValues={entry.old_values} newValues={entry.new_values} compact />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
