"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Eraser,
  FolderOpen,
  HardDrive,
  Mail,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import {
  AccessDenied,
  Button,
  Card,
  ErrorBanner,
  Modal,
  Skeleton,
  Tooltip,
} from "@/app/admin/_components/ui/index";
import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import { systemHealthApi, type HealthResult, type HealthSizes } from "@/app/admin/_lib/api/systemHealthApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/utils";

import { HealthGroupCard } from "./HealthGroupCard";

import { QK } from "@/config/query-keys";
export default function SystemHealth() {
  const can = usePermissions();
  const queryClient = useQueryClient();
  const canView = can(PERM.SYSTEM_HEALTH_VIEW);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [QK.SYSTEM_HEALTH, "checks"],
    queryFn: systemHealthApi.checks,
    enabled: canView,
  });
  const sizes = useQuery({
    queryKey: [QK.SYSTEM_HEALTH, "sizes"],
    queryFn: systemHealthApi.sizes,
    enabled: canView && sizesOpen,
  });

  if (!canView) return <AccessDenied />;

  async function rerun() {
    const res = await refetch();
    queryClient.invalidateQueries({ queryKey: [QK.SYSTEM_HEALTH, "summary"] });
    if (res.data) toast.success("Checks finished");
  }

  async function copyReport() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildReport(data));
      toast.success("Report copied to the clipboard");
    } catch {
      toast.error("Couldn't copy the report.");
    }
  }

  async function testMail() {
    setTestingMail(true);
    try {
      const res = await systemHealthApi.mailCheck();
      toast.success(res.message ?? "Connected to the mail server");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not connect to the mail server."), { duration: 10000 });
    } finally {
      setTestingMail(false);
    }
  }

  async function clearCache() {
    setClearingCache(true);
    try {
      const res = await systemHealthApi.clearCache();
      if (res.status) toast.success(res.message ?? "Website cache cleared");
      else toast.warning(res.message ?? "The website didn't respond");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't clear the cache."));
    } finally {
      setClearingCache(false);
    }
  }

  const summary = data?.summary;

  return (
    <>
      <h1 className="sr-only">System health</h1>
      <KpiGrid cols={4}>
        <KpiTile
          icon={XCircle}
          tone="red"
          label="Problems"
          value={summary?.errors}
          hint={summary ? (summary.errors ? "Need fixing" : "None found") : undefined}
        />
        <KpiTile
          icon={AlertTriangle}
          tone="amber"
          label="Warnings"
          value={summary?.warnings}
          hint={summary ? (summary.warnings ? "Worth a look" : "None found") : undefined}
        />
        <KpiTile
          icon={CheckCircle2}
          tone="green"
          label="Passed"
          value={summary?.ok}
          hint={summary ? `of ${summary.total} checks` : undefined}
        />
        <KpiTile
          icon={Clock}
          tone="slate"
          label="Last checked"
          value={summary ? timeAgo(summary.checked_at) : undefined}
          hint={summary ? formatDateTime(summary.checked_at) : undefined}
        />
      </KpiGrid>

      <Card className="mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <p className="text-fg-subtle min-w-0 flex-1 text-sm">
          Server, database, scheduler, email, backups and security.
        </p>
        <div className="flex items-center gap-1.5">
          <Tooltip label="Folder sizes">
            <Button
              iconOnly
              variant="secondary"
              leftIcon={HardDrive}
              aria-label="Folder sizes"
              onClick={() => setSizesOpen(true)}
              className="h-9 w-9"
            />
          </Tooltip>
          {can(PERM.SYSTEM_HEALTH_MANAGE) && (
            <Tooltip label="Test SMTP connection">
              <Button
                iconOnly
                variant="secondary"
                leftIcon={Mail}
                aria-label="Test SMTP connection"
                loading={testingMail}
                onClick={testMail}
                className="h-9 w-9"
              />
            </Tooltip>
          )}
          {can(PERM.SYSTEM_HEALTH_MANAGE) && (
            <Tooltip label="Clear website cache">
              <Button
                iconOnly
                variant="secondary"
                leftIcon={Eraser}
                aria-label="Clear website cache"
                loading={clearingCache}
                onClick={clearCache}
                className="h-9 w-9"
              />
            </Tooltip>
          )}
          <Tooltip label="Copy report">
            <Button
              iconOnly
              variant="secondary"
              leftIcon={ClipboardCopy}
              aria-label="Copy report"
              disabled={!data}
              onClick={copyReport}
              className="h-9 w-9"
            />
          </Tooltip>
          <Tooltip label="Re-run checks" align="end">
            <Button
              iconOnly
              leftIcon={RefreshCw}
              aria-label="Re-run checks"
              loading={isFetching}
              onClick={rerun}
              className="h-9 w-9"
            />
          </Tooltip>
        </div>
      </Card>

      {error && (
        <ErrorBanner className="mb-4" message={apiErrorMessage(error, "The checks could not run.")} />
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : (
        data && (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {data.groups.map((group) => (
              <HealthGroupCard key={group.key} group={group} />
            ))}
          </div>
        )
      )}

      <Modal
        open={sizesOpen}
        onClose={() => setSizesOpen(false)}
        size="sm"
        title="Folder sizes"
        description="Disk space used by the app's storage folders and the database."
        footer={
          <Button variant="secondary" onClick={() => setSizesOpen(false)}>
            Close
          </Button>
        }
      >
        <SizesList data={sizes.data} loading={sizes.isLoading} />
      </Modal>
    </>
  );
}

function SizesList({ data, loading }: { data: HealthSizes | undefined; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  const rows = [
    ...data.folders.map((f) => ({
      key: f.key,
      label: f.label,
      sub: f.path,
      bytes: f.bytes,
      partial: !f.complete,
    })),
    {
      key: "database",
      label: data.database.label,
      sub: "PostgreSQL",
      bytes: data.database.bytes ?? 0,
      partial: data.database.bytes === null,
    },
  ];
  return (
    <ul className="divide-line border-line divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <FolderOpen className="text-fg-faint h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-fg text-sm font-medium">{row.label}</p>
              <p className="text-fg-subtle truncate text-xs">{row.sub}</p>
            </div>
          </div>
          <span className="tabular text-fg text-sm font-semibold">
            {row.partial ? "≥ " : ""}
            {formatBytes(row.bytes)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function buildReport(result: HealthResult): string {
  const { summary } = result;
  const lines = [
    "System health report",
    `Checked ${formatDateTime(summary.checked_at)}`,
    `Overall: ${summary.status.toUpperCase()} - ${summary.errors} problem(s), ${summary.warnings} warning(s), ${summary.ok} of ${summary.total} passed`,
    "",
  ];
  for (const group of result.groups) {
    lines.push(`## ${group.label}`);
    for (const check of group.checks) {
      const detail = [check.value ? `${check.value}.` : "", check.message].filter(Boolean).join(" ");
      lines.push(`[${check.status.toUpperCase()}] ${check.label}: ${detail}`);
      if (check.hint && check.status !== "ok") lines.push(`    Fix: ${check.hint}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
