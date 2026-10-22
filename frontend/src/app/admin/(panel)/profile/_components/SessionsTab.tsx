"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Monitor, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton } from "@/app/admin/_components/ui/index";
import { profileApi, type UserSessionInfo } from "@/app/admin/_lib/api/profileApi";
import { apiErrorMessage } from "@/app/admin/_lib/api/errors";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

import { QK } from "@/config/query-keys";
function DeviceIcon({ device }: { device: string | null }) {
  const Icon = device === "mobile" ? Smartphone : device === "tablet" ? Tablet : Monitor;
  return <Icon size={18} aria-hidden />;
}

function SessionRow({ session, onRevoke }: { session: UserSessionInfo; onRevoke?: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          session.is_current ? "bg-primary-soft text-primary" : "bg-hover text-fg-subtle"
        )}
      >
        <DeviceIcon device={session.device} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg flex flex-wrap items-center gap-2 text-sm font-medium">
          {session.browser || "Unknown browser"}
          {session.platform && <span className="text-fg-subtle font-normal">on {session.platform}</span>}
          {session.is_current && <Badge tone="green">This device</Badge>}
        </p>
        <p className="text-fg-subtle text-xs">
          {session.ip_address ?? "Unknown IP"} ·{" "}
          <span title={formatDateTime(session.last_active_at)}>
            {session.is_current ? "Active now" : `Last active ${timeAgo(session.last_active_at)}`}
          </span>
          {" · "}Signed in {formatDateTime(session.created_at)}
        </p>
      </div>
      {onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={LogOut}
          onClick={onRevoke}
          aria-label="Sign out this session"
        >
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      )}
    </li>
  );
}

export function SessionsTab() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: [QK.PROFILE, "sessions"], queryFn: profileApi.sessions });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.PROFILE, "sessions"] });

  const run = async (fn: () => Promise<{ message?: string }>, fallback: string) => {
    try {
      const res = await fn();
      toast.success(res.message ?? "Done");
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, fallback));
    }
  };

  const revoke = async (s: UserSessionInfo) => {
    const ok = await confirm({
      title: "Sign out this session?",
      message: `${s.browser || "This device"} will be signed out immediately.`,
      confirmLabel: "Sign out",
      variant: "warning",
    });
    if (ok) await run(() => profileApi.revokeSession(s.id), "Couldn't end session");
  };

  const revokeOthers = async () => {
    const ok = await confirm({
      title: "Sign out all other sessions?",
      message: "Every device except this one will be signed out.",
      confirmLabel: "Sign out others",
      variant: "warning",
    });
    if (ok) await run(profileApi.revokeOtherSessions, "Couldn't end sessions");
  };

  const sessions = [...(data ?? [])].sort((a, b) => Number(b.is_current) - Number(a.is_current));
  const others = sessions.filter((s) => !s.is_current).length;

  return (
    <Card>
      <CardHeader
        title="Active sessions"
        description="Devices currently signed in to your account. Sign out any you don't recognise."
        actions={
          others > 0 && (
            <Button variant="danger-outline" size="sm" leftIcon={LogOut} onClick={revokeOthers}>
              Sign out all other sessions
            </Button>
          )
        }
      />
      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={Monitor} title="No active sessions" />
      ) : (
        <ul className="divide-line divide-y">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} onRevoke={s.is_current ? undefined : () => revoke(s)} />
          ))}
        </ul>
      )}
    </Card>
  );
}
