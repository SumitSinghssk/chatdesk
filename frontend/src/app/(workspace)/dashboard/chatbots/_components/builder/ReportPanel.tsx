"use client";

import Link from "next/link";
import { BarChart3, X } from "lucide-react";

import { Badge, Button, Select, Skeleton } from "@/app/admin/_components/ui/index";
import { CUSTOMER_ROUTES } from "@/config/routes/customer";
import { timeAgo } from "@/lib/utils";

import type { BotReport } from "../../../_lib/chatbotsApi";

const REASONS: Record<
  string,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }
> = {
  completed: { label: "Finished", tone: "success" },
  handover: { label: "Handed over", tone: "info" },
  timeout: { label: "Went quiet", tone: "warning" },
  stopped: { label: "Stopped", tone: "neutral" },
  agent: { label: "Team replied", tone: "info" },
  opted_out: { label: "Opted out", tone: "neutral" },
  replaced: { label: "Another bot", tone: "neutral" },
  invalid: { label: "Wrong answers", tone: "warning" },
  failed: { label: "Error", tone: "danger" },
};

export function ReportPanel({
  report,
  days,
  onDays,
  onClose,
  onFocus,
}: {
  report: BotReport | undefined;
  days: number;
  onDays: (d: number) => void;
  onClose: () => void;
  onFocus: (nodeId: string) => void;
}) {
  const tiles = report
    ? [
        { label: "Started", value: report.started },
        { label: "Talking now", value: report.active },
        { label: "Finished", value: report.completed },
        { label: "Handed over", value: report.handover },
        { label: "Dropped off", value: report.dropped },
        { label: "Completion", value: report.completion_rate === null ? "—" : `${report.completion_rate}%` },
      ]
    : [];
  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Chatbot analytics">
      <div className="border-line flex items-center gap-2 border-b px-4 py-3">
        <BarChart3 className="text-primary h-4.5 w-4.5" aria-hidden />
        <p className="text-fg flex-1 text-sm font-semibold">Analytics</p>
        <Select
          aria-label="Period"
          size="sm"
          value={days}
          onChange={(v) => onDays(Number(v))}
          options={[7, 30, 90, 365].map((d) => ({ value: d, label: `Last ${d} days` }))}
          wrapperClassName="w-36"
        />
        <Button variant="ghost" iconOnly leftIcon={X} aria-label="Close analytics" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!report ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {tiles.map((t) => (
                <div key={t.label} className="border-line bg-page rounded-xl border px-3 py-2">
                  <p className="text-fg-subtle text-[11px]">{t.label}</p>
                  <p className="text-fg text-lg font-semibold tabular-nums">{t.value}</p>
                </div>
              ))}
            </div>
            <p className="text-fg-subtle text-xs">
              The canvas shows how many people reached each block, which button they tapped, and where people
              left.
            </p>
            <div>
              <p className="text-fg mb-2 text-sm font-semibold">Recent chats</p>
              {report.recent.length === 0 ? (
                <p className="text-fg-subtle text-sm">No one has gone through this chatbot yet.</p>
              ) : (
                <ul className="divide-line border-line divide-y rounded-xl border">
                  {report.recent.map((s) => {
                    const r =
                      s.status === "active"
                        ? { label: "Talking", tone: "success" as const }
                        : REASONS[s.end_reason ?? ""];
                    return (
                      <li key={s.id} className="flex items-start gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`${CUSTOMER_ROUTES.INBOX()}?c=${s.conversation_id}`}
                            className="text-fg hover:text-primary block truncate font-medium"
                          >
                            {s.contact?.name || s.contact?.phone || "Customer"}
                          </Link>
                          <p className="text-fg-subtle truncate text-xs">
                            {timeAgo(s.started_at)}
                            {s.node && (
                              <>
                                {" · at "}
                                <button
                                  type="button"
                                  className="hover:text-primary underline-offset-2 hover:underline"
                                  onClick={() => s.node_id && onFocus(s.node_id)}
                                >
                                  {s.node}
                                </button>
                              </>
                            )}
                          </p>
                          {s.error && <p className="truncate text-xs text-red-600">{s.error}</p>}
                        </div>
                        {r && <Badge tone={r.tone}>{r.label}</Badge>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
