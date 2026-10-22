"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { Avatar, Badge, DataTable, EmptyState, type Column } from "@/app/admin/_components/ui/index";

import { duration, TEAM_QK, teamApi, type MemberPerformance } from "../../_lib/teamApi";
import { Segmented } from "../../templates/_components/editor/parts";

const PERIODS = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function Speed({ seconds }: { seconds: number | null }) {
  if (seconds == null) return <span className="text-fg-faint">—</span>;
  const tone = seconds <= 300 ? "success" : seconds <= 1800 ? "warning" : "danger";
  return <Badge tone={tone}>{duration(seconds)}</Badge>;
}

export function PerformanceTab() {
  const [days, setDays] = useState("7");
  const { data, isLoading } = useQuery({
    queryKey: TEAM_QK.PERFORMANCE(Number(days)),
    queryFn: async () => (await teamApi.performance(Number(days))).data,
    refetchInterval: 60_000,
  });

  const columns: Column<MemberPerformance>[] = [
    {
      key: "member",
      header: "Member",
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.member.name} size={28} />
          <span className="min-w-0">
            <span className="text-fg block truncate font-medium">{r.member.name}</span>
            <span className="text-fg-subtle block text-xs capitalize">
              {r.member.role} · {r.member.availability}
            </span>
          </span>
        </span>
      ),
    },
    { key: "open", header: "Open chats", cell: (r) => <span className="tabular">{r.open_chats}</span> },
    { key: "resolved", header: "Resolved", cell: (r) => <span className="tabular">{r.resolved}</span> },
    {
      key: "replies",
      header: "Messages sent",
      hideOnMobile: true,
      cell: (r) => <span className="tabular">{r.replies}</span>,
    },
    { key: "avg", header: "Avg first response", cell: (r) => <Speed seconds={r.avg_response_seconds} /> },
    {
      key: "fast",
      header: "Answered within 5 min",
      hideOnMobile: true,
      cell: (r) =>
        r.within_5_min == null ? (
          <span className="text-fg-faint">—</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="bg-hover h-1.5 w-20 overflow-hidden rounded-full">
              <span className="bg-primary block h-full" style={{ width: `${r.within_5_min}%` }} />
            </span>
            <span className="tabular text-xs">{r.within_5_min}%</span>
          </span>
        ),
    },
  ];

  const t = data?.totals;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <Segmented label="Period" value={days} onChange={setDays} options={PERIODS} />
        {t && (
          <p className="text-fg-subtle text-sm">
            Team average <span className="text-fg font-semibold">{duration(t.avg_response_seconds)}</span>{" "}
            over {t.responses} answered wait{t.responses === 1 ? "" : "s"} · {t.resolved} resolved
          </p>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={data?.members}
        getRowId={(r) => r.member.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={BarChart3}
            title="No activity yet"
            description="Numbers appear as your team answers chats."
          />
        }
      />
      <p className="text-fg-faint px-4 py-3 text-xs sm:px-5">
        First response = time from a customer&apos;s message to the first reply from your team (counted per
        waiting customer, not per message). Campaign messages don&apos;t count.
      </p>
    </div>
  );
}
