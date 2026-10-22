import { createCrudApi, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { Status } from "./types";

export interface TeamSocialLink {
  platform: string;
  url: string;
}

export interface TeamMember {
  id: number;
  name: string;
  designation: string | null;
  department: string | null;
  bio: string | null;
  photo: string | null;
  email: string | null;
  phone: string | null;
  social_links: TeamSocialLink[];
  is_featured: boolean;
  sort_order: number;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberPayload {
  name: string;
  designation?: string | null;
  department?: string | null;
  bio?: string | null;
  photo?: string | null;
  email?: string | null;
  phone?: string | null;
  social_links: TeamSocialLink[];
  is_featured: boolean;
  sort_order?: number;
  status: Status;
}

export interface TeamStats {
  total: number;
  active: number;
  inactive: number;
  featured: number;
  without_photo: number;
  departments: string[];
  this_week: number;
  last_week: number;
}

const E = ADMIN_ENDPOINTS.TEAM;

export const teamApi = {
  ...createCrudApi<TeamMember, TeamMemberPayload>(E),
  reorder: (ids: number[]) => send<null>("post", E.REORDER, { ids }),
  stats: () => getOne<TeamStats>(E.STATS),
};
