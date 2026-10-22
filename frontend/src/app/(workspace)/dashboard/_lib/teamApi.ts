import { request } from "@/app/(customer)/_lib/customerApi";
import type { CustomerProfile } from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";

export type MemberRole = "owner" | "admin" | "agent";

export interface Member {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: MemberRole;
  status: "active" | "invited" | string;
  availability: "available" | "away";
  teams: { id: number; name: string }[];
  open_chats: number;
  last_login_at: string | null;
  invited_by: string | null;
  invite_expires_at: string | null;
  is_you: boolean;
  created_at: string;
  /** only right after inviting / re-inviting */
  invite_url?: string;
}

export interface Team {
  id: number;
  name: string;
  description: string | null;
  member_ids: number[];
  open_chats: number;
  created_at: string;
}

export interface TeamSettings {
  auto_assign: "off" | "round_robin";
  assign_team_id: number | null;
  only_available: boolean;
  max_open: number | null;
  agent_visibility: "all" | "assigned" | "own";
}

export interface MemberPerformance {
  member: { id: number; name: string; role: MemberRole; availability: string };
  open_chats: number;
  resolved: number;
  replies: number;
  responses: number;
  avg_response_seconds: number | null;
  within_5_min: number | null;
}

export interface Performance {
  days: number;
  members: MemberPerformance[];
  totals: {
    avg_response_seconds: number | null;
    responses: number;
    waiting_now: number;
    unassigned_open: number;
    resolved: number;
    replies: number;
  };
}

export interface InviteInfo {
  email: string;
  name: string | null;
  role: MemberRole;
  invited_by: string | null;
  workspace: string | null;
}

const T = CUSTOMER_ENDPOINTS.TEAM;

export const teamApi = {
  members: () => request<Member[]>("GET", T.MEMBERS),
  invite: (body: { email: string; name?: string | null; role: "admin" | "agent"; team_ids: number[] }) =>
    request<Member>("POST", T.MEMBERS, body),
  reinvite: (id: number) => request<Member>("POST", T.REINVITE(id)),
  updateMember: (id: number, body: { role: "admin" | "agent"; team_ids: number[] }) =>
    request<Member>("PUT", T.MEMBER(id), body),
  removeMember: (id: number) => request<null>("DELETE", T.MEMBER(id)),
  teams: () => request<Team[]>("GET", T.TEAMS),
  saveTeam: (body: { name: string; description?: string | null; member_ids: number[] }, id?: number) =>
    id ? request<Team>("PUT", T.TEAM(id), body) : request<Team>("POST", T.TEAMS, body),
  deleteTeam: (id: number) => request<null>("DELETE", T.TEAM(id)),
  settings: () => request<TeamSettings>("GET", T.SETTINGS),
  saveSettings: (body: TeamSettings) => request<TeamSettings>("PUT", T.SETTINGS, body),
  availability: (availability: "available" | "away") =>
    request<{ availability: string }>("PUT", T.AVAILABILITY, { availability }),
  performance: (days: number) => request<Performance>("GET", withQuery(T.PERFORMANCE, { days })),
  invitation: (token: string) => request<InviteInfo>("GET", T.INVITE(token)),
  accept: (token: string, body: { name: string; password: string; password_confirmation: string }) =>
    request<{ customer: CustomerProfile }>("POST", T.ACCEPT(token), body),
};

export const TEAM_QK = {
  ALL: ["team"] as const,
  MEMBERS: ["team", "members"] as const,
  TEAMS: ["team", "teams"] as const,
  SETTINGS: ["team", "settings"] as const,
  PERFORMANCE: (days: number) => ["team", "performance", days] as const,
};

/** "2m 05s", "1h 10m", "3d 4h" */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${String(seconds % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
