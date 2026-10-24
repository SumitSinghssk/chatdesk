"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Database,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Avatar, Badge, Card, ErrorBanner } from "@/app/admin/_components/ui/index";
import { cn, formatDate } from "@/lib/utils";

import { DataSection } from "../account/_components/DataSection";
import { NotificationsSection } from "../account/_components/NotificationsSection";
import { PreferencesSection } from "../account/_components/PreferencesSection";
import { ProfileSection } from "../account/_components/ProfileSection";
import { SecuritySection } from "../account/_components/SecuritySection";
import { useDashboard } from "./DashboardContext";

type Section = "profile" | "security" | "notifications" | "preferences" | "data";

const SECTIONS: { key: Section; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "profile", label: "Profile", hint: "Photo, name, email, mobile", icon: UserRound },
  { key: "security", label: "Security", hint: "Password, two-step, devices", icon: ShieldCheck },
  { key: "notifications", label: "Notifications", hint: "What you're told, and how", icon: Bell },
  { key: "preferences", label: "Preferences", hint: "Time zone, theme, sounds", icon: SlidersHorizontal },
  { key: "data", label: "Data & privacy", hint: "Download, delete", icon: Database },
];

const ROLE = { owner: "Owner", admin: "Admin", agent: "Agent" } as const;

export function AccountSettings() {
  const { me } = useDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("section") as Section | null;
  const section: Section = SECTIONS.some((s) => s.key === raw) ? raw! : "profile";
  const go = (s: Section) =>
    router.replace(`${pathname}${s === "profile" ? "" : `?section=${s}`}`, { scroll: false });

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Account</h1>
      <Card className="from-primary-soft/70 to-surface overflow-hidden bg-gradient-to-r">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="ring-surface rounded-full shadow-sm ring-4">
            <Avatar name={me.name ?? me.email ?? "You"} src={me.avatar} size={72} className="rounded-full" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-xl font-bold tracking-tight">{me.name || "Your name"}</p>
            <p className="text-fg-subtle truncate text-sm">
              {[
                me.job_title,
                me.workspace?.name && me.workspace.name !== me.name ? me.workspace.name : null,
                me.email,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{ROLE[me.role]}</Badge>
            {me.two_factor_enabled ? (
              <Badge tone="success">
                <ShieldCheck className="h-3 w-3" aria-hidden /> Two-step on
              </Badge>
            ) : (
              <button type="button" onClick={() => go("security")}>
                <Badge tone="warning">
                  <ShieldAlert className="h-3 w-3" aria-hidden /> Two-step off
                </Badge>
              </button>
            )}
            <span className="text-fg-faint text-xs">Member since {formatDate(me.created_at)}</span>
          </div>
        </div>
      </Card>

      {!me.name && <ErrorBanner message="Add your name in Profile so your team knows who you are." />}

      <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Account sections" className="lg:sticky lg:top-0">
          <ul className="no-scrollbar -m-1 flex gap-1 overflow-x-auto p-1 lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => {
              const active = s.key === section;
              return (
                <li key={s.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(s.key)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                      active
                        ? "bg-surface text-fg ring-line shadow-xs ring-1"
                        : "text-fg-subtle hover:bg-hover hover:text-fg"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-primary-soft text-primary" : "bg-hover"
                      )}
                    >
                      <s.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium whitespace-nowrap">{s.label}</span>
                      <span className="text-fg-faint hidden text-xs lg:block">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          {section === "profile" && <ProfileSection />}
          {section === "security" && <SecuritySection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "preferences" && <PreferencesSection key={JSON.stringify(me.preferences)} />}
          {section === "data" && <DataSection />}
        </div>
      </div>
    </div>
  );
}
