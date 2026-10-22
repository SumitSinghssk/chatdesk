"use client";

import { useRef, type ComponentType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Building2,
  Clock,
  Code2,
  Construction,
  CreditCard,
  FileText,
  KeyRound,
  Mail,
  MailOpen,
  MessageSquareText,
  MessagesSquare,
  Map,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { AccessDenied, Button, Card, EmptyState, Skeleton, Tabs } from "@/app/admin/_components/ui/index";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { settingsApi, type SettingsGroup } from "@/app/admin/_lib/api/settingsApi";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { cn } from "@/lib/utils";

import { CommentsTab } from "./CommentsTab";
import { CustomerLoginTab } from "./CustomerLoginTab";
import { DateTimeTab } from "./DateTimeTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";
import { GeneralTab } from "./GeneralTab";
import Logs from "@/app/admin/(panel)/logs/_components/Logs";
import { MailTab } from "./MailTab";
import { MaintenanceTab } from "./MaintenanceTab";
import { PaymentsTab } from "./PaymentsTab";
import { RobotsTab } from "./RobotsTab";
import { ScriptsTab } from "./ScriptsTab";
import { SecurityTab } from "./SecurityTab";
import { SitemapTab } from "./SitemapTab";
import { SmsTab } from "./SmsTab";
import { SettingsDirtyContext, type TabProps } from "./SettingsForm";

import { QK } from "@/config/query-keys";
type TabKey =
  | "general"
  | "date-time"
  | "security"
  | "email"
  | "email-templates"
  | "sms"
  | "payments"
  | "customer-login"
  | "scripts"
  | "sitemap"
  | "logs"
  | "comments"
  | "robots"
  | "maintenance";

type TabDef = {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  permission?: string;
} & (
  | {
      group: SettingsGroup;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component: ComponentType<TabProps<any>>;
      standalone?: never;
    }
  | { standalone: ComponentType<{ canEdit: boolean }>; group?: never; component?: never }
);

const TABS: TabDef[] = [
  { key: "general", group: "general", label: "Business profile", icon: Building2, component: GeneralTab },
  { key: "date-time", group: "date_time", label: "Date & time", icon: Clock, component: DateTimeTab },
  { key: "security", group: "security", label: "Security", icon: ShieldCheck, component: SecurityTab },
  { key: "email", group: "mail", label: "Email (SMTP)", icon: Mail, component: MailTab },
  { key: "email-templates", label: "Email templates", icon: MailOpen, standalone: EmailTemplatesTab },
  { key: "sms", label: "SMS gateways", icon: MessageSquareText, standalone: SmsTab },
  { key: "payments", label: "Payment gateways", icon: CreditCard, standalone: PaymentsTab },
  {
    key: "customer-login",
    group: "customer_auth",
    label: "Customer login",
    icon: KeyRound,
    component: CustomerLoginTab,
  },
  { key: "scripts", group: "scripts", label: "Scripts & CSS", icon: Code2, component: ScriptsTab },
  { key: "sitemap", label: "Sitemap", icon: Map, standalone: SitemapTab },
  { key: "logs", label: "Application logs", icon: FileText, standalone: Logs, permission: PERM.LOGS_VIEW },
  {
    key: "comments",
    group: "comments",
    label: "Blog comments",
    icon: MessagesSquare,
    component: CommentsTab,
  },
  { key: "robots", group: "robots", label: "Robots.txt", icon: Bot, component: RobotsTab },
  {
    key: "maintenance",
    group: "maintenance",
    label: "Maintenance mode",
    icon: Construction,
    component: MaintenanceTab,
  },
];

export default function Settings() {
  const can = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canView = can(PERM.SETTINGS_VIEW);
  const confirm = useConfirm();
  const dirtyRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QK.SETTINGS],
    queryFn: () => settingsApi.all(),
    enabled: canView,
  });

  if (!canView) return <AccessDenied />;

  const canEdit = can(PERM.SETTINGS_UPDATE);
  const tabs = TABS.filter((t) => !t.permission || can(t.permission));
  const active = tabs.find((t) => t.key === searchParams.get("tab")) ?? tabs[0]!;
  const select = async (key: TabKey) => {
    if (key === active.key) return;
    if (dirtyRef.current) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "Your edits haven't been saved and will be lost.",
        confirmLabel: "Discard",
        variant: "warning",
      });
      if (!ok) return;
      dirtyRef.current = false;
    }
    const sp = new URLSearchParams(searchParams.toString());
    for (const param of ["template", "file", "lines"]) sp.delete(param);
    if (key === "general") sp.delete("tab");
    else sp.set("tab", key);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="lg:hidden">
          <Tabs<TabKey>
            className="px-2"
            value={active.key}
            onChange={select}
            tabs={tabs.map((t) => ({ value: t.key, label: t.label }))}
          />
        </Card>

        <nav aria-label="Settings sections" className="sticky top-0 hidden lg:block">
          <ul className="space-y-0.5">
            {tabs.map((t) => {
              const Icon = t.icon;
              const current = t.key === active.key;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    onClick={() => select(t.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                      current ? "bg-primary-soft text-primary" : "text-fg-muted hover:bg-hover hover:text-fg"
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {active.standalone ? (
            <active.standalone key={active.key} canEdit={canEdit} />
          ) : error ? (
            <Card>
              <EmptyState
                title="Couldn't load settings"
                description={apiErrorMessage(error)}
                action={
                  <Button variant="secondary" onClick={() => refetch()}>
                    Try again
                  </Button>
                }
              />
            </Card>
          ) : isLoading || !data ? (
            <Card className="space-y-4 p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
            </Card>
          ) : (
            <SettingsDirtyContext value={dirtyRef}>
              <active.component key={active.key} data={data[active.group]} canEdit={canEdit} />
            </SettingsDirtyContext>
          )}
        </div>
      </div>
    </>
  );
}
