import api from "./client";
import { getList, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse } from "./types";
import type { AuthUser } from "./authApi";

export const SOCIAL_KEYS = ["twitter", "linkedin", "github", "instagram", "facebook", "youtube"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export interface ProfilePayload {
  name: string;
  phone: string | null;
  bio: string | null;
  social_links: Partial<Record<SocialKey, string | null>>;
}

export interface ChangePasswordPayload {
  current_password: string;
  password: string;
  password_confirmation: string;
}

export interface UserSessionInfo {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  browser: string | null;
  platform: string | null;
  device: string | null;
  remember?: boolean;
  created_at: string | null;
  last_active_at: string | null;
  expires_at: string | null;
  is_current: boolean;
  revoked?: boolean;
}

export interface TwoFactorStatus {
  enabled: boolean;
  confirmed_at: string | null;
  recovery_codes_left: number;
  required_by_role: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
  qr_svg: string;
}

type WithCodes = TwoFactorStatus & { recovery_codes: string[] };

const E = ADMIN_ENDPOINTS.PROFILE;

export const profileApi = {
  update: (payload: ProfilePayload) => send<AuthUser>("put", E.UPDATE, payload),
  async uploadAvatar(file: File) {
    const body = new FormData();
    body.append("file", file);
    const res = await api.post<ApiResponse<AuthUser>>(E.AVATAR, body);
    return res.data;
  },
  removeAvatar: () => send<AuthUser>("delete", E.AVATAR),
  changePassword: (payload: ChangePasswordPayload) =>
    send<{ access_token: string; token_type: string; expires_in?: number }>("put", E.PASSWORD, payload),

  sessions: () => getList<UserSessionInfo>(E.SESSIONS),
  revokeSession: (id: string) => send<null>("delete", E.SESSION(id)),
  revokeOtherSessions: () => send<null>("delete", E.SESSIONS),

  twoFactor: () => getOne<TwoFactorStatus>(E.TWO_FACTOR),
  twoFactorSetup: () => send<TwoFactorSetup>("post", E.TWO_FACTOR_SETUP),
  twoFactorConfirm: (code: string) => send<WithCodes>("post", E.TWO_FACTOR_CONFIRM, { code }),
  regenerateRecoveryCodes: (password: string) => send<WithCodes>("post", E.TWO_FACTOR_RECOVERY, { password }),
  disableTwoFactor: (password: string) => send<TwoFactorStatus>("delete", E.TWO_FACTOR, { password }),
};
