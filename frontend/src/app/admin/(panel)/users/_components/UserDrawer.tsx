"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Tablet,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  Skeleton,
  StatusBadge,
} from "@/app/admin/_components/ui/index";
import type { UserSessionInfo } from "@/app/admin/_lib/api/profileApi";
import { permissionsApi, roleLabel, rolesApi } from "@/app/admin/_lib/api/rolesApi";
import { usersApi } from "@/app/admin/_lib/api/usersApi";
import { apiErrorMessage, apiErrorStatus } from "@/app/admin/_lib/api/errors";
import { PERM } from "@/config/permissions";
import { usePermissions } from "@/app/admin/_hooks/usePermissions";
import { cn, formatDate, formatDateTime, safeHttpUrl, timeAgo, titleCase } from "@/lib/utils";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { actionLabel } from "@/app/admin/(panel)/roles/_components/PermissionPicker";

import { QK } from "@/config/query-keys";
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="text-fg-subtle w-36 shrink-0 text-xs font-semibold sm:pt-0.5">{label}</dt>
      <dd className="text-fg min-w-0 text-sm break-words">
        {children || <span className="text-fg-subtle">—</span>}
      </dd>
    </div>
  );
}

function SessionItem({ session, onRevoke }: { session: UserSessionInfo; onRevoke?: () => void }) {
  const Icon = session.device === "mobile" ? Smartphone : session.device === "tablet" ? Tablet : Monitor;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="bg-hover text-fg-subtle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-medium">
          {session.browser || "Unknown browser"}
          {session.platform && <span className="text-fg-subtle font-normal"> on {session.platform}</span>}
        </p>
        <p className="text-fg-subtle text-xs">
          {session.ip_address ?? "Unknown IP"} ·{" "}
          <span title={formatDateTime(session.last_active_at)}>
            Last active {timeAgo(session.last_active_at)}
          </span>
        </p>
      </div>
      {onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leftIcon={LogOut}
          aria-label="End session"
          title="End session"
          onClick={onRevoke}
        />
      )}
    </li>
  );
}

export function UserDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: number | null;
  onClose: () => void;
  onEdit: (id: number) => void;
}) {
  const can = usePermissions();
  const meId = useAuthStore((s) => s.user?.id);
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: [QK.USERS, "detail", id],
    queryFn: () => usersApi.detail(id!),
    enabled: !!id && can(PERM.USERS_VIEW),
    retry: (count, err) => apiErrorStatus(err) !== 404 && count < 2,
  });
  const { data: roles = [] } = useQuery({ queryKey: [QK.ROLES, "all"], queryFn: () => rolesApi.all() });
  const { data: groups } = useQuery({
    queryKey: [QK.PERMISSIONS, "grouped"],
    queryFn: permissionsApi.grouped,
    staleTime: 60_000,
  });

  const open = id !== null && can(PERM.USERS_VIEW);
  if (!user || user.id !== id) {
    return (
      <Modal open={open} onClose={onClose} variant="drawer" size="2xl" title="User" bodyClassName="bg-page">
        {error && !isLoading ? (
          <Card>
            <EmptyState
              title={apiErrorStatus(error) === 404 ? "User not found" : "Couldn't load this user"}
              description={apiErrorMessage(error, "It may have been deleted.")}
            />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3" aria-busy>
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl lg:col-span-2" />
          </div>
        )}
      </Modal>
    );
  }

  const isSelf = user.id === meId;
  const canSecurity = can(PERM.USERS_MANAGE_SECURITY);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [QK.USERS] });

  const run = async (opts: {
    title: string;
    message: string;
    label: string;
    fn: () => Promise<{ message?: string }>;
  }) => {
    const ok = await confirm({
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.label,
      variant: "warning",
    });
    if (!ok) return;
    try {
      const res = await opts.fn();
      toast.success(res.message ?? "Done");
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Action failed"));
    }
  };

  const role = roles.find((r) => r.id === user.role_id);
  const allAccess = !!role?.is_system;
  const viaRole = new Set(role?.permissions ?? []);
  const direct = new Set(user.permissions);
  const effectiveGroups = (groups ?? [])
    .map((g) => ({
      group: g.group,
      items: g.permissions.filter((p) => viaRole.has(p.name) || direct.has(p.name)),
    }))
    .filter((g) => g.items.length > 0);
  const effectiveCount = effectiveGroups.reduce((n, g) => n + g.items.length, 0);

  const social = Object.entries(user.social_links ?? {}).filter(([, v]) => !!v);

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      size="2xl"
      bodyClassName="bg-page"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {user.name}
          {isSelf && <Badge tone="blue">You</Badge>}
        </span>
      }
      description={user.email}
      headerActions={
        can(PERM.USERS_UPDATE) && (
          <Button size="sm" leftIcon={Pencil} onClick={() => onEdit(user.id)}>
            Edit user
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardBody className="flex flex-col items-center py-6 text-center">
              <span className="relative">
                <Avatar name={user.name} src={user.avatar} size={88} />
                {user.is_online && (
                  <span
                    className="bg-success ring-surface absolute right-1 bottom-1 h-3.5 w-3.5 rounded-full ring-2"
                    title="Online now"
                  />
                )}
              </span>
              <p className="text-fg mt-3 text-base font-semibold">{user.name}</p>
              <p className="text-fg-subtle text-sm">{user.role ? roleLabel(user.role.name) : "No role"}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <StatusBadge status={user.status} />
                {user.is_online && <Badge tone="green">Online</Badge>}
                {user.is_locked && <Badge tone="red">Locked</Badge>}
                {user.two_factor_enabled && <Badge tone="green">2FA</Badge>}
              </div>
            </CardBody>
            <dl className="divide-line border-line divide-y border-t px-4 py-1">
              <Row label="Phone">{user.phone}</Row>
              <Row label="Member since">{formatDate(user.created_at)}</Row>
              <Row label="Last login">
                {user.last_login_at ? (
                  <span title={formatDateTime(user.last_login_at)}>
                    {timeAgo(user.last_login_at)}
                    {user.last_login_ip && <span className="text-fg-subtle"> from {user.last_login_ip}</span>}
                  </span>
                ) : (
                  "Never"
                )}
              </Row>
              {user.bio && <Row label="Bio">{user.bio}</Row>}
              {social.length > 0 && (
                <Row label="Social">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {social.map(([k, v]) => {
                      const href = safeHttpUrl(v);
                      return href ? (
                        <a
                          key={k}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {titleCase(k)}
                        </a>
                      ) : (
                        <span key={k} title={v}>
                          {titleCase(k)}: {v}
                        </span>
                      );
                    })}
                  </span>
                </Row>
              )}
            </dl>
          </Card>

          {canSecurity && (
            <Card>
              <CardHeader title="Security" description="Sign-in protection for this account." />
              <ul className="divide-line divide-y">
                <li className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      user.is_locked ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                    )}
                  >
                    {user.is_locked ? <Lock size={16} aria-hidden /> : <Unlock size={16} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg text-sm font-medium">
                      {user.is_locked ? "Account locked" : "Not locked"}
                    </p>
                    <p className="text-fg-subtle text-xs">
                      {user.is_locked
                        ? `Until ${formatDateTime(user.locked_until)}`
                        : `${user.failed_logins} recent failed sign-in(s)`}
                    </p>
                  </div>
                  {user.is_locked && (
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={Unlock}
                      onClick={() =>
                        run({
                          title: "Unlock this account?",
                          message: `${user.name} will be able to sign in again right away.`,
                          label: "Unlock",
                          fn: () => usersApi.unlock(user.id),
                        })
                      }
                    >
                      Unlock
                    </Button>
                  )}
                </li>
                <li className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      user.two_factor_enabled ? "bg-success-soft text-success" : "bg-hover text-fg-subtle"
                    )}
                  >
                    {user.two_factor_enabled ? (
                      <ShieldCheck size={16} aria-hidden />
                    ) : (
                      <ShieldOff size={16} aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg text-sm font-medium">
                      Two-factor {user.two_factor_enabled ? "enabled" : "not set up"}
                    </p>
                    <p className="text-fg-subtle text-xs">
                      {user.two_factor_enabled
                        ? "Reset it if they lost their authenticator."
                        : "They can enable it from their profile."}
                    </p>
                  </div>
                  {user.two_factor_enabled && !isSelf && (
                    <Button
                      size="sm"
                      variant="danger-outline"
                      leftIcon={KeyRound}
                      onClick={() =>
                        run({
                          title: "Reset two-factor sign-in?",
                          message: `${user.name} will need to set up two-factor again. Their recovery codes stop working.`,
                          label: "Reset 2FA",
                          fn: () => usersApi.resetTwoFactor(user.id),
                        })
                      }
                    >
                      Reset 2FA
                    </Button>
                  )}
                </li>
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Role & effective permissions"
              description={
                allAccess
                  ? "This role has unrestricted access."
                  : `${effectiveCount} permission(s): inherited from the role plus any granted directly.`
              }
              actions={user.role && <Badge tone="purple">{roleLabel(user.role.name)}</Badge>}
            />
            <CardBody>
              {allAccess ? (
                <p className="bg-primary-soft text-primary rounded-lg px-3 py-2 text-sm">
                  Every permission is granted through the {roleLabel(role!.name)} role.
                </p>
              ) : !groups ? (
                <Skeleton className="h-32 w-full" />
              ) : effectiveGroups.length === 0 ? (
                <EmptyState
                  icon={ShieldOff}
                  title="No permissions"
                  description="This user can sign in but can't open any admin section."
                  className="py-8"
                />
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {effectiveGroups.map((g) => (
                      <div key={g.group}>
                        <p className="text-fg-subtle mb-1 text-xs font-semibold tracking-wide uppercase">
                          {g.group}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.items.map((p) => (
                            <Badge key={p.id} tone={viaRole.has(p.name) ? "default" : "blue"}>
                              {actionLabel(p.name)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {direct.size > 0 && (
                    <p className="border-line text-fg-subtle flex items-center gap-1.5 border-t pt-3 text-xs">
                      <Badge tone="blue">Blue</Badge> = granted directly to this user
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Active sessions"
              description="Devices where this user is currently signed in."
              actions={
                canSecurity &&
                user.sessions.length > 0 && (
                  <Button
                    size="sm"
                    variant="danger-outline"
                    leftIcon={LogOut}
                    onClick={() =>
                      run({
                        title: "Sign out of all devices?",
                        message: `${user.name} will be signed out everywhere${isSelf ? ", including this browser" : ""}.`,
                        label: "Sign out all",
                        fn: () => usersApi.revokeAllSessions(user.id),
                      })
                    }
                  >
                    Sign out all
                  </Button>
                )
              }
            />
            {user.sessions.length === 0 ? (
              <EmptyState icon={Monitor} title="No active sessions" className="py-8" />
            ) : (
              <ul className="divide-line divide-y">
                {user.sessions.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    onRevoke={
                      canSecurity
                        ? () =>
                            run({
                              title: "End this session?",
                              message: `${s.browser || "This device"} will be signed out immediately.`,
                              label: "End session",
                              fn: () => usersApi.revokeSession(user.id, s.id),
                            })
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Modal>
  );
}
