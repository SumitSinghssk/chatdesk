import { Globe, Monitor } from "lucide-react";

import type { RowSlots } from "@/app/admin/_components/grid/types";
import { Avatar } from "@/app/admin/_components/ui/index";
import type { ActivityLog } from "@/app/admin/_lib/api/activityLogsApi";
import { formatDateTime, timeAgo, titleCase } from "@/lib/utils";

import { ActionBadge } from "@/app/admin/_components/activity";

export const actorName = (row: ActivityLog) => row.user?.name ?? row.user_email ?? "System";

export function SubjectText({ row }: { row: ActivityLog }) {
  return (
    <>
      <span className="text-fg block truncate">{row.description || titleCase(row.action)}</span>
      {row.subject_type && (
        <span className="text-fg-subtle block truncate text-xs">
          {titleCase(row.subject_type)}
          {row.subject_label && <> · {row.subject_label}</>}
        </span>
      )}
    </>
  );
}

export function ActivityListItem({ row, slots }: { row: ActivityLog; slots: RowSlots }) {
  return (
    <div className="flex items-start gap-3">
      {slots.checkbox && <span className="pt-0.5">{slots.checkbox}</span>}
      <Avatar name={actorName(row)} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-fg truncate font-medium">{actorName(row)}</span>
          <ActionBadge action={row.action} />
          <span className="text-fg-subtle ml-auto shrink-0 text-xs" title={formatDateTime(row.created_at)}>
            {timeAgo(row.created_at)}
          </span>
        </div>
        <div className="mt-0.5 min-w-0 text-sm">
          <SubjectText row={row} />
        </div>
        {(row.ip_address || row.browser) && (
          <div className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {row.ip_address && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Globe className="h-3.5 w-3.5" />
                {row.ip_address}
              </span>
            )}
            {row.browser && (
              <span className="inline-flex items-center gap-1">
                <Monitor className="h-3.5 w-3.5" />
                {row.browser}
                {row.platform && ` · ${row.platform}`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityCard({ row, slots }: { row: ActivityLog; slots: RowSlots }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={actorName(row)} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate font-semibold">{actorName(row)}</p>
          {row.user && <p className="text-fg-subtle truncate text-xs">{row.user.email}</p>}
        </div>
        {slots.checkbox}
      </div>
      <div className="mt-3">
        <ActionBadge action={row.action} />
      </div>
      <div className="mt-2 mb-4 min-w-0 text-sm">
        <SubjectText row={row} />
      </div>
      <div className="border-line text-fg-subtle mt-auto flex items-center gap-2 border-t pt-3 text-xs">
        <span className="truncate font-mono">{row.ip_address ?? "—"}</span>
        <span className="ml-auto shrink-0" title={formatDateTime(row.created_at)}>
          {timeAgo(row.created_at)}
        </span>
      </div>
    </>
  );
}
