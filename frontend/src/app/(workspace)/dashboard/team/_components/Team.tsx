"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Hourglass,
  Link2,
  MessageSquareDashed,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/app/admin/_components/ConfirmProvider";
import { KpiGrid, KpiTile } from "@/app/admin/_components/grid";
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Tabs,
  type Column,
} from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { timeAgo } from "@/lib/utils";

import { useDashboard } from "../../_components/DashboardContext";
import { Tooltip } from "../../_components/Tooltip";
import { duration, TEAM_QK, teamApi, type Member, type Team as TeamGroup } from "../../_lib/teamApi";
import { EditMemberModal, InviteLink, InviteModal } from "./MemberModals";
import { PerformanceTab } from "./PerformanceTab";
import { RulesTab } from "./RulesTab";
import { TeamModal } from "./TeamModal";

type Tab = "members" | "teams" | "rules" | "performance";
const ROLE_TONE = { owner: "brand", admin: "info", agent: "neutral" } as const;

export function Team() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { me } = useDashboard();
  const tab = (params.get("tab") as Tab) || "members";
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [linkFor, setLinkFor] = useState<Member | null>(null);
  const [teamModal, setTeamModal] = useState<TeamGroup | "new" | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: TEAM_QK.MEMBERS,
    queryFn: async () => (await teamApi.members()).data,
    refetchInterval: 30_000,
  });
  const { data: teams } = useQuery({
    queryKey: TEAM_QK.TEAMS,
    queryFn: async () => (await teamApi.teams()).data,
  });
  const { data: perf } = useQuery({
    queryKey: TEAM_QK.PERFORMANCE(7),
    queryFn: async () => (await teamApi.performance(7)).data,
  });

  const workspace = me.workspace?.name || me.business_name || "our business";
  const refresh = () => void queryClient.invalidateQueries({ queryKey: TEAM_QK.ALL });
  const setTab = (t: Tab) =>
    router.replace(`${pathname}${t === "members" ? "" : `?tab=${t}`}`, { scroll: false });

  const remove = async (m: Member) => {
    const ok = await confirm({
      title: m.status === "invited" ? `Cancel the invite for ${m.email}?` : `Remove ${m.name || m.email}?`,
      message:
        m.status === "invited"
          ? "The invite link stops working."
          : `They're signed out and can't open the workspace any more.${m.open_chats ? ` Their ${m.open_chats} open chat${m.open_chats === 1 ? "" : "s"} become unassigned.` : ""}`,
      confirmLabel: m.status === "invited" ? "Cancel invite" : "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await teamApi.removeMember(m.id);
      toast.success(res.message ?? "Removed");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const newLink = async (m: Member) => {
    try {
      const res = await teamApi.reinvite(m.id);
      setLinkFor(res.data);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns: Column<Member>[] = [
    {
      key: "member",
      header: "Member",
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="relative shrink-0">
            <Avatar name={m.name || m.email || "?"} size={32} />
            {m.status === "active" && (
              <span
                className={`ring-surface absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ${m.availability === "away" ? "bg-amber-400" : "bg-emerald-500"}`}
                title={m.availability === "away" ? "Away" : "Available"}
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="text-fg flex items-center gap-1.5 truncate font-medium">
              {m.name || m.email}
              {m.is_you && <Badge>You</Badge>}
            </span>
            <span className="text-fg-subtle block truncate text-xs">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (m) => (
        <Badge tone={ROLE_TONE[m.role] ?? "neutral"}>
          {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
        </Badge>
      ),
    },
    {
      key: "teams",
      header: "Teams",
      hideOnMobile: true,
      cell: (m) =>
        m.teams.length ? (
          <span className="flex flex-wrap gap-1">
            {m.teams.map((t) => (
              <Badge key={t.id} tone="info">
                {t.name}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-fg-faint">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (m) =>
        m.status === "invited" ? (
          <Badge tone="warning" dot>
            Invited
          </Badge>
        ) : (
          <span className="text-fg-subtle text-xs">
            <span className="text-fg tabular font-medium">{m.open_chats}</span> open chat
            {m.open_chats === 1 ? "" : "s"}
            <span className="block">
              {m.last_login_at ? `Last login ${timeAgo(m.last_login_at)}` : "Never logged in"}
            </span>
          </span>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (m) =>
        m.role === "owner" ? null : (
          <span className="flex items-center justify-end gap-0.5">
            {m.status === "invited" && (
              <Tooltip label="New invite link">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Link2}
                  aria-label={`New invite link for ${m.email}`}
                  onClick={() => newLink(m)}
                />
              </Tooltip>
            )}
            <Tooltip label="Edit role and teams">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                leftIcon={Pencil}
                aria-label={`Edit ${m.email}`}
                onClick={() => setEditing(m)}
              />
            </Tooltip>
            {!m.is_you && (
              <Tooltip label={m.status === "invited" ? "Cancel invite" : "Remove"} align="end">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  leftIcon={Trash2}
                  aria-label={`Remove ${m.email}`}
                  onClick={() => remove(m)}
                  className="hover:text-danger"
                />
              </Tooltip>
            )}
          </span>
        ),
    },
  ];

  const active = (members ?? []).filter((m) => m.status === "active");
  const available = active.filter((m) => m.availability === "available").length;

  return (
    <>
      <h1 className="sr-only">Team</h1>
      <KpiGrid cols={4}>
        <KpiTile
          icon={Users}
          tone="green"
          label="Members"
          value={members?.length}
          hint={`${(members?.length ?? 0) - active.length} invited`}
          onClick={() => setTab("members")}
          active={tab === "members"}
        />
        <KpiTile
          icon={UsersRound}
          tone="blue"
          label="Available now"
          value={available}
          hint={`${active.length - available} away`}
        />
        <KpiTile
          icon={Hourglass}
          tone={perf?.totals.waiting_now ? "amber" : "slate"}
          label="Customers waiting"
          value={perf?.totals.waiting_now}
          hint={`${perf?.totals.unassigned_open ?? 0} chats unassigned`}
        />
        <KpiTile
          icon={Clock}
          tone="purple"
          label="Avg first response"
          value={duration(perf?.totals.avg_response_seconds)}
          hint="Last 7 days"
          onClick={() => setTab("performance")}
          active={tab === "performance"}
        />
      </KpiGrid>

      <Card>
        <div className="flex items-center gap-3 px-4 pt-2 sm:px-5">
          <Tabs<Tab>
            className="min-w-0 flex-1"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "members", label: "Members", count: members?.length },
              { value: "teams", label: "Teams", count: teams?.length },
              { value: "rules", label: "Assignment rules" },
              { value: "performance", label: "Performance" },
            ]}
          />
          {tab === "members" && (
            <Button size="sm" leftIcon={UserPlus} onClick={() => setInviting(true)} className="shrink-0">
              Invite
            </Button>
          )}
          {tab === "teams" && (
            <Button size="sm" leftIcon={Plus} onClick={() => setTeamModal("new")} className="shrink-0">
              New team
            </Button>
          )}
        </div>

        {tab === "members" && (
          <DataTable
            columns={columns}
            rows={members}
            getRowId={(m) => m.id}
            loading={isLoading}
            empty={
              <EmptyState
                icon={Users}
                title="Just you so far"
                description="Invite agents to share the inbox."
              />
            }
          />
        )}

        {tab === "teams" && (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {(teams ?? []).length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={UsersRound}
                  title="No teams yet"
                  description="Group people, e.g. Sales and Support. Chats can be given to a team, and new chats can go round-robin within one."
                  action={
                    <Button leftIcon={Plus} onClick={() => setTeamModal("new")}>
                      New team
                    </Button>
                  }
                />
              </div>
            )}
            {(teams ?? []).map((t) => {
              const people = (members ?? []).filter((m) => t.member_ids.includes(m.id));
              return (
                <div key={t.id} className="border-line bg-surface rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-fg truncate font-semibold">{t.name}</p>
                      <p className="text-fg-subtle line-clamp-2 text-xs">
                        {t.description || "No description"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leftIcon={Pencil}
                      aria-label={`Edit team ${t.name}`}
                      onClick={() => setTeamModal(t)}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="flex -space-x-2">
                      {people.slice(0, 5).map((m) => (
                        <span
                          key={m.id}
                          className="ring-surface rounded-full ring-2"
                          title={m.name || m.email || ""}
                        >
                          <Avatar name={m.name || m.email || "?"} size={28} />
                        </span>
                      ))}
                      {people.length === 0 && <span className="text-fg-faint text-xs">No members</span>}
                    </span>
                    <span className="text-fg-subtle flex items-center gap-1 text-xs">
                      <MessageSquareDashed className="h-3.5 w-3.5" /> {t.open_chats} open
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "rules" && <RulesTab teams={teams ?? []} />}
        {tab === "performance" && <PerformanceTab />}
      </Card>

      <InviteModal
        open={inviting}
        teams={teams ?? []}
        workspace={workspace}
        onClose={() => setInviting(false)}
        onInvited={refresh}
      />
      <EditMemberModal
        key={`member-${editing?.id ?? "none"}`}
        member={editing}
        teams={teams ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
      {linkFor && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg">
          <div className="bg-surface relative rounded-xl shadow-2xl">
            <InviteLink member={linkFor} workspace={workspace} />
            <button
              type="button"
              onClick={() => setLinkFor(null)}
              className="text-fg-subtle hover:text-fg absolute top-3 right-3 text-xs font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <TeamModal
        key={`team-${teamModal === "new" ? "new" : (teamModal?.id ?? "none")}`}
        team={teamModal}
        members={members ?? []}
        onClose={() => setTeamModal(null)}
        onSaved={() => {
          setTeamModal(null);
          refresh();
        }}
      />
    </>
  );
}
