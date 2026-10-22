import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code,
  Database,
  HardDrive,
  Info,
  Mail,
  Save,
  Server,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge, Card, CardHeader, type BadgeTone } from "@/app/admin/_components/ui/index";
import type { HealthGroup, HealthStatus } from "@/app/admin/_lib/api/systemHealthApi";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<
  HealthStatus,
  { icon: LucideIcon; tone: BadgeTone; label: string; text: string }
> = {
  ok: { icon: CheckCircle2, tone: "success", label: "OK", text: "text-success" },
  warning: { icon: AlertTriangle, tone: "warning", label: "Warning", text: "text-warning" },
  error: { icon: XCircle, tone: "danger", label: "Problem", text: "text-danger" },
  info: { icon: Info, tone: "info", label: "Info", text: "text-info" },
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  server: Server,
  code: Code,
  database: Database,
  "hard-drive": HardDrive,
  clock: Clock,
  mail: Mail,
  save: Save,
  "shield-check": ShieldCheck,
};

export function HealthGroupCard({ group }: { group: HealthGroup }) {
  const meta = STATUS_META[group.status];
  return (
    <Card>
      <CardHeader
        title={group.label}
        icon={GROUP_ICONS[group.icon] ?? Server}
        actions={
          <Badge tone={meta.tone} dot>
            {group.status === "ok" ? "All good" : meta.label}
          </Badge>
        }
      />
      <ul className="divide-line divide-y">
        {group.checks.map((check) => {
          const status = STATUS_META[check.status];
          const Icon = status.icon;
          return (
            <li key={check.key} className="flex gap-3 px-4 py-3 sm:px-5">
              <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", status.text)} aria-label={status.label} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-fg text-sm font-medium">{check.label}</p>
                  {check.value && (
                    <p className="text-fg-muted max-w-full text-sm break-words sm:text-right">
                      {check.value}
                    </p>
                  )}
                </div>
                {check.message && (
                  <p className="text-fg-subtle mt-0.5 text-xs break-words">{check.message}</p>
                )}
                {check.hint && check.status !== "ok" && (
                  <p
                    className={cn(
                      "mt-1.5 rounded-md px-2 py-1 text-xs",
                      check.status === "error"
                        ? "bg-danger-soft text-danger"
                        : check.status === "warning"
                          ? "bg-warning-soft text-warning"
                          : "bg-info-soft text-info"
                    )}
                  >
                    {check.hint}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
