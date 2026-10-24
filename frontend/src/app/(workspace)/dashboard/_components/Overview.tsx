"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, Gauge, MessageCircle, MessagesSquare, Radio } from "lucide-react";

import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import { Button, Card, ErrorBanner } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ROUTES } from "@/config/routes";
import { cn, timeAgo } from "@/lib/utils";

import { WORKSPACE_MODULES } from "../_lib/nav";
import { WORKSPACE_QK, whatsappApi } from "../_lib/whatsappApi";
import { CardHeader } from "./CardHeader";

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
  const { data, isLoading, error } = useQuery({
    queryKey: WORKSPACE_QK.OVERVIEW,
    queryFn: async () => (await whatsappApi.overview()).data,
    staleTime: 30_000,
  });

  const connection = data?.connection;
  const connected = connection?.status === "connected";

  return (
    <>
      <h1 className="sr-only">Overview</h1>

      {error && <ErrorBanner className="mb-4" message={errorMessage(error)} />}

      <KpiGrid cols={4}>
        <KpiTile
          icon={MessageCircle}
          tone={connected ? "green" : connection ? "red" : "amber"}
          label="WhatsApp number"
          value={
            isLoading ? undefined : connected ? "Connected" : connection ? "Needs attention" : "Not connected"
          }
          hint={connection?.display_phone_number ?? connection?.verified_name ?? "WhatsApp Business"}
        />
        <KpiTile
          icon={Gauge}
          tone="blue"
          label="Quality rating"
          value={isLoading ? undefined : (connection?.quality_rating ?? "—")}
          hint={connection?.messaging_limit_tier ?? "Messaging tier unknown"}
        />
        <KpiTile
          icon={MessagesSquare}
          tone="purple"
          label="Messages received"
          value={isLoading ? undefined : (data?.counts.messages ?? 0)}
          hint={`${data?.counts.statuses ?? 0} delivery updates`}
        />
        <KpiTile
          icon={Radio}
          tone={connection?.webhook_verified_at ? "green" : "amber"}
          label="Last webhook event"
          value={isLoading ? undefined : connection?.last_event_at ? timeAgo(connection.last_event_at) : "—"}
          hint={connection?.webhook_verified_at ? "Webhook verified" : "Webhook not verified yet"}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
