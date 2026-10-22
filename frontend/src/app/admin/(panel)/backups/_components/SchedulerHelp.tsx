"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardBody, CardHeader, Tabs } from "@/app/admin/_components/ui/index";
import type { BackupSchedule } from "@/app/admin/_lib/api/backupsApi";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const FRESH_MS = 5 * 60 * 1000;

export function SchedulerHelp({ schedule }: { schedule: BackupSchedule }) {
  const { cron_command: cmd, last_scheduler_run: last } = schedule;
  const [os, setOs] = useState<"linux" | "windows">(cmd.is_windows ? "windows" : "linux");
  const [checkedAt] = useState(() => Date.now());
  const fresh = !!last && checkedAt - new Date(last).getTime() < FRESH_MS;
  const command = os === "windows" ? cmd.windows : cmd.linux;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Command copied");
    } catch {
      toast.error("Couldn't copy. Select the command and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader title="Run the scheduler" icon={Clock} />
      <CardBody className="space-y-4">
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm",
            fresh ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
          )}
        >
          {fresh ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {fresh
              ? `Running. Last run ${timeAgo(last)}.`
              : last
                ? `Not seen since ${formatDateTime(last)} (${timeAgo(last)}). Scheduled backups won't happen until it runs again.`
                : "Not set up on this server yet. Scheduled backups, trash clean-up and log pruning won't happen."}
          </span>
        </div>

        <p className="text-fg-muted text-sm">
          <code className="bg-page rounded px-1 py-px text-xs">scheduler.py</code> must run every minute. It
          makes the scheduled backup when it&apos;s due and does the clean-up jobs.
        </p>

        <Tabs
          tabs={[
            { value: "linux", label: "Linux (cron)" },
            { value: "windows", label: "Windows" },
          ]}
          value={os}
          onChange={setOs}
          className="mb-0"
        />

        <div className="space-y-2">
          <pre className="border-line bg-page text-fg overflow-x-auto rounded-lg border p-3 text-xs leading-relaxed break-all whitespace-pre-wrap">
            {command}
          </pre>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-fg-subtle text-xs">
              {os === "windows"
                ? cmd.windows_note
                : "Add it with crontab -e as the user that owns the project."}
            </p>
            <Button size="sm" variant="secondary" leftIcon={Copy} onClick={copy}>
              Copy
            </Button>
          </div>
        </div>
        <p className="text-fg-subtle text-xs">
          Test it by hand with <code className="bg-page rounded px-1 py-px">{cmd.manual}</code> (add{" "}
          <code className="bg-page rounded px-1 py-px">--force-backup</code> to make a backup straight away).
        </p>
      </CardBody>
    </Card>
  );
}
