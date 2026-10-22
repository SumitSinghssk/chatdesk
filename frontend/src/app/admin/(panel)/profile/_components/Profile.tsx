"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs } from "@/app/admin/_components/ui/index";

import { ProfileTab } from "./ProfileTab";
import { SecurityTab } from "./SecurityTab";
import { SessionsTab } from "./SessionsTab";

type Tab = "profile" | "security" | "sessions";
const TABS: { value: Tab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "security", label: "Security" },
  { value: "sessions", label: "Sessions" },
];

export default function Profile() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "profile";

  const setTab = (next: Tab) =>
    router.replace(next === "profile" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  return (
    <>
      <h1 className="sr-only">My profile</h1>
      <Tabs<Tab> tabs={TABS} value={tab} onChange={setTab} className="mb-4" />
      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "sessions" && <SessionsTab />}
    </>
  );
}
