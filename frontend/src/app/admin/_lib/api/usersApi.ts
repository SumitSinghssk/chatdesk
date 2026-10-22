import { createCrudApi, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { IdName, Status } from "./types";
import type { UserSessionInfo } from "./profileApi";

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  status: Status;
  role_id: number | null;
  role: IdName | null;
  permissions: string[];
  direct_permission_ids: number[];
  two_factor_enabled: boolean;
  is_locked: boolean;
  locked_until: string | null;
  failed_logins: number;
  last_login_at: string | null;
  last_login_ip: string | null;
  is_online: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserDetail extends User {
  sessions: UserSessionInfo[];
}

export interface UserPayload {
  name: string;
  email: string;
  phone?: string | null;
  role_id?: number | null;
  status: Status;
  bio?: string | null;
  permission_ids: number[];
  password?: string | null;
  password_confirmation?: string | null;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  locked: number;
  two_factor: number;
  online: number;
  no_role: number;
  never_logged_in: number;
  this_week: number;
  last_week: number;
}

const E = ADMIN_ENDPOINTS.USERS;

export const usersApi = {
  ...createCrudApi<User, UserPayload>(E),
  detail: (id: number) => getOne<UserDetail>(E.SHOW(id)),
  stats: () => getOne<UserStats>(E.STATS),
  unlock: (id: number) => send<UserDetail>("post", E.UNLOCK(id)),
  resetTwoFactor: (id: number) => send<UserDetail>("delete", E.RESET_TWO_FACTOR(id)),
  revokeSession: (id: number, sessionId: string) => send<null>("delete", E.SESSION(id, sessionId)),
  revokeAllSessions: (id: number) => send<null>("delete", E.SESSIONS(id)),
};
