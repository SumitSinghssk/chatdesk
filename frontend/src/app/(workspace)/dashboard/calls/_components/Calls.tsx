"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card, Tabs } from "@/app/admin/_components/ui/index";

import { useDashboard } from "../../_components/DashboardContext";
import { CallLogTab } from "./CallLogTab";
import { CallSettingsTab } from "./CallSettingsTab";

type Tab = "log" | "settings";

export function Calls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { me } = useDashboard();
  const manager = me.role !== "agent";
  const tab: Tab = manager && params.get("tab") === "settings" ? "settings" : "log";
  const setTab = (t: Tab) =>
    router.replace(`${pathname}${t === "log" ? "" : `?tab=${t}`}`, { scroll: false });

  return (
    <div className="max-w-6xl space-y-5">
      <h1 className="sr-only">Calls</h1>
      <Card>
        {manager && (
          <div className="px-4 pt-2 sm:px-5">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "log", label: "Call log" },
                { value: "settings", label: "Settings" },
              ]}
            />
          </div>
        )}
        {tab === "settings" ? (
          <CallSettingsTab />
        ) : (
          <CallLogTab onSetup={manager ? () => setTab("settings") : undefined} />
        )}
      </Card>
    </div>
  );
}
