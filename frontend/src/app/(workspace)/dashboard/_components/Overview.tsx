"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Gauge,
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  Radio,
} from "lucide-react";

import { Button, Card, ErrorBanner, PageHeader, Skeleton, StatCard } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, timeAgo } from "@/lib/utils";

import { WORKSPACE_MODULES } from "../_lib/nav";
import { WORKSPACE_QK, whatsappApi } from "../_lib/whatsappApi";
import { useDashboard } from "./DashboardContext";
import { CardHeader } from "./CardHeader";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Step({
  done,
  title,
  text,
  href,
  cta,
}: {
  done: boolean;
  title: string;
  text: string;
  href?: string;
  cta?: string;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon
        size={18}
        className={cn("mt-0.5 shrink-0", done ? "text-success" : "text-fg-faint")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done ? "text-fg-subtle line-through" : "text-fg")}>{title}</p>
        <p className="text-fg-subtle text-xs">{text}</p>
      </div>
      {!done && href && (
        <Button href={href} variant="ghost" size="sm" rightIcon={ArrowRight}>
          {cta}
        </Button>
      )}
    </li>
  );
}

export function Overview() {
  const { me } = useDashboard();
  const { data, isLoading, error } = useQuery({
    queryKey: WORKSPACE_QK.OVERVIEW,
    queryFn: async () => (await whatsappApi.overview()).data,
    staleTime: 30_000,
  });

  const connection = data?.connection;
  const connected = connection?.status === "connected";
  const name = me.name?.split(" ")[0] ?? "";
  const value = (v: React.ReactNode) => (isLoading ? <Skeleton className="mt-1 h-6 w-16" /> : v);

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title={`${greeting()}${name ? `, ${name}` : ""}`}
        description={
          connected
            ? `${me.business_name ?? "Your business"} is live on WhatsApp${connection?.display_phone_number ? ` (${connection.display_phone_number})` : ""}.`
            : "Connect your WhatsApp Business number to start talking to customers."
        }
        actions={
          !connected && (
            <Button href={CUSTOMER_ROUTES.WHATSAPP()} leftIcon={MessageCircle}>
              Connect WhatsApp
            </Button>
          )
        }
      />

      {error && <ErrorBanner className="mb-4" message={errorMessage(error)} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="WhatsApp number"
          value={value(connected ? "Connected" : connection ? "Needs attention" : "Not connected")}
          icon={MessageCircle}
          tone={connected ? "green" : connection ? "red" : "yellow"}
          hint={connection?.verified_name ?? "WhatsApp Business"}
        />
        <StatCard
          label="Quality rating"
          value={value(connection?.quality_rating ?? "—")}
          icon={Gauge}
          tone="blue"
          hint={connection?.messaging_limit_tier ?? "Messaging tier unknown"}
        />
        <StatCard
          label="Messages received"
          value={value(data?.counts.messages ?? 0)}
          icon={MessagesSquare}
          tone="purple"
          hint={`${data?.counts.statuses ?? 0} delivery updates`}
        />
        <StatCard
          label="Last webhook event"
          value={value(connection?.last_event_at ? timeAgo(connection.last_event_at) : "—")}
          icon={Radio}
          tone={connection?.webhook_verified_at ? "green" : "yellow"}
          hint={connection?.webhook_verified_at ? "Webhook verified" : "Webhook not verified yet"}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Get set up" description="Four steps to go live on WhatsApp." />
            <ol className="divide-line divide-y">
              <Step done title="Create your account" text="You're in." />
              <Step
                done={!!connection}
                title="Add your WhatsApp Business number"
                text="Paste your WABA ID, phone number ID and access token from Meta."
                href={CUSTOMER_ROUTES.WHATSAPP()}
                cta="Add number"
              />
              <Step
                done={connected}
                title="Check the connection"
                text="We confirm the details with Meta and show your number's quality."
                href={CUSTOMER_ROUTES.WHATSAPP()}
                cta="Check"
              />
              <Step
                done={!!connection?.webhook_verified_at}
                title="Verify the webhook"
                text="Paste your webhook URL and verify token in the Meta app to receive messages."
                href={CUSTOMER_ROUTES.WHATSAPP()}
                cta="Show details"
              />
            </ol>
          </Card>
        </div>

        <Card>
          <CardHeader title="Coming next" description="Modules on the roadmap." />
          <ul className="divide-line divide-y">
            {WORKSPACE_MODULES.filter((m) => m.status === "planned").map((m) => (
              <li key={m.key}>
                <Link
                  href={m.href}
                  className="hover:bg-hover flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                >
                  <m.icon size={16} className="text-fg-faint shrink-0" aria-hidden />
                  <span className="text-fg flex-1">{m.label}</span>
                  <span className="text-fg-subtle text-xs">{m.phase}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
