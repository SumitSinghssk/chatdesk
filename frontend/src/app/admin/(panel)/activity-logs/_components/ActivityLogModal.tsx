"use client";

import type { ReactNode } from "react";

import { ActionBadge, ChangesTable } from "@/app/admin/_components/activity";
import { Avatar, Modal } from "@/app/admin/_components/ui/index";
import type { ActivityLog } from "@/app/admin/_lib/api/activityLogsApi";
import { formatDateTime, titleCase } from "@/lib/utils";

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-subtle text-xs font-semibold">{label}</dt>
      <dd className="text-fg mt-0.5 text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

export function ActivityLogModal({ log, onClose }: { log: ActivityLog | null; onClose: () => void }) {
  return (
    <Modal
      open={!!log}
      onClose={onClose}
      size="lg"
      title="Activity details"
      description={log ? formatDateTime(log.created_at) : undefined}
    >
      {log && (
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <Avatar name={log.user?.name ?? log.user_email ?? "System"} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-fg text-sm font-semibold">{log.user?.name ?? log.user_email ?? "System"}</p>
              {log.user && <p className="text-fg-subtle text-xs">{log.user.email}</p>}
              <p className="text-fg mt-2 text-sm">{log.description || titleCase(log.action)}</p>
            </div>
            <ActionBadge action={log.action} />
          </div>

          <dl className="border-line bg-page grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-2">
            <Meta label="Subject">
              {log.subject_type ? (
                <>
                  {titleCase(log.subject_type)}
                  {log.subject_id ? ` #${log.subject_id}` : ""}
                  {log.subject_label && <span className="text-fg-muted"> · {log.subject_label}</span>}
                </>
              ) : null}
            </Meta>
            <Meta label="IP address">{log.ip_address}</Meta>
            <Meta label="Browser">{log.browser}</Meta>
            <Meta label="Platform / device">
              {[log.platform, log.device && titleCase(log.device)].filter(Boolean).join(" · ")}
            </Meta>
            <div className="sm:col-span-2">
              <Meta label="User agent">
                {log.user_agent && <span className="font-mono text-xs">{log.user_agent}</span>}
              </Meta>
            </div>
          </dl>

          <div>
            <h4 className="text-fg mb-2 text-sm font-semibold">Changes</h4>
            <ChangesTable oldValues={log.old_values} newValues={log.new_values} />
          </div>
        </div>
      )}
    </Modal>
  );
}
