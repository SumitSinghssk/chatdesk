"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, UserMinus, UserRoundCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Avatar, Dropdown, type DropdownItem } from "@/app/admin/_components/ui/index";
import { errorMessage } from "@/app/(customer)/_lib/customerApi";
import { cn } from "@/lib/utils";

import { useDashboard } from "../../_components/DashboardContext";
import { INBOX_QK, inboxApi, type Conversation } from "../../_lib/inboxApi";
import { TEAM_QK, teamApi } from "../../_lib/teamApi";

/** Who handles this chat: pick a person (or yourself), a team, or nobody. */
export function AssignMenu({
  conversation,
  onChanged,
}: {
  conversation: Conversation;
  onChanged: (c: Conversation) => void;
}) {
  const queryClient = useQueryClient();
  const { me } = useDashboard();
  const { data: members } = useQuery({
    queryKey: TEAM_QK.MEMBERS,
    queryFn: async () => (await teamApi.members()).data,
    staleTime: 60_000,
  });
  const { data: teams } = useQuery({
    queryKey: TEAM_QK.TEAMS,
    queryFn: async () => (await teamApi.teams()).data,
    staleTime: 60_000,
  });

  const assignee = conversation.assignee;
  const teamId = conversation.team?.id ?? null;

  const save = async (assigneeId: number | null, nextTeam: number | null = teamId) => {
    try {
      const res = await inboxApi.assign(conversation.id, { assignee_id: assigneeId, team_id: nextTeam });
      onChanged(res.data);
      toast.success(res.message ?? "Saved");
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.MESSAGES(conversation.id) });
      void queryClient.invalidateQueries({ queryKey: ["inbox", "list"] });
      void queryClient.invalidateQueries({ queryKey: INBOX_QK.SUMMARY });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const people = (members ?? []).filter((m) => m.status === "active");
  const items: (DropdownItem | "divider")[] = [
    {
      label: "Assign to me",
      icon: UserRoundCheck,
      onClick: () => save(me.id),
      hidden: assignee?.id === me.id,
    },
    "divider",
    ...people.map((m) => ({
      label: (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="relative shrink-0">
            <Avatar name={m.name || m.email || "?"} size={20} />
            <span
              className={cn(
                "ring-surface absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2",
                m.availability === "away" ? "bg-amber-400" : "bg-emerald-500"
              )}
            />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {m.name || m.email}
            {m.is_you ? " (you)" : ""}
          </span>
          <span className="text-fg-faint text-[11px]">{m.open_chats}</span>
          {assignee?.id === m.id && <Check className="text-primary h-3.5 w-3.5" />}
        </span>
      ),
      onClick: () => save(m.id),
    })),
    ...(teams?.length
      ? [
          "divider" as const,
          ...teams.map((t) => ({
            label: (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <UsersRound className="text-fg-faint h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Team {t.name}</span>
                {teamId === t.id && <Check className="text-primary h-3.5 w-3.5" />}
              </span>
            ),
            onClick: () => save(assignee?.id ?? null, teamId === t.id ? null : t.id),
          })),
        ]
      : []),
    "divider",
    { label: "Unassign", icon: UserMinus, onClick: () => save(null), hidden: !assignee, danger: true },
  ];

  return (
    <Dropdown
      align="right"
      width="w-64"
      header={<span className="text-fg-subtle text-xs font-medium">Assign this chat</span>}
      trigger={(open) => (
        <button
          type="button"
          aria-label={assignee ? `Assigned to ${assignee.name}. Change` : "Assign this chat"}
          aria-expanded={open}
          className={cn(
            "border-line hover:bg-hover flex h-8 max-w-44 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition",
            assignee ? "text-fg" : "text-fg-subtle"
          )}
        >
          {assignee ? (
            <Avatar name={assignee.name} size={18} />
          ) : (
            <UserRoundCheck className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="hidden truncate sm:inline">
            {assignee ? (assignee.id === me.id ? "You" : assignee.name) : "Assign"}
            {conversation.team ? ` · ${conversation.team.name}` : ""}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      )}
      items={items}
    />
  );
}
