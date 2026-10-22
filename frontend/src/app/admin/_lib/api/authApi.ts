import api from "./client";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ApiResponse } from "./types";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  social_links: Record<string, string>;
  status: string;
  role: { id: number; name: string } | null;
  permissions: string[];
  two_factor_enabled: boolean;
  two_factor_required: boolean;
  last_login_at: string | null;
  created_at: string | null;
  idle_minutes?: number;
  site?: { name: string; timezone: string };
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  remember?: boolean;
  user: AuthUser;
}

export interface TwoFactorRequired {
  two_factor_required: true;
  two_factor_token: string;
}

export type LoginResult = AuthTokens | TwoFactorRequired;

export function isTwoFactorRequired(result: LoginResult): result is TwoFactorRequired {
  return "two_factor_required" in result && result.two_factor_required;
}

export async function login(payload: { email: string; password: string; remember: boolean }) {
  const res = await api.post<ApiResponse<LoginResult>>(ADMIN_ENDPOINTS.AUTH.LOGIN, payload);
  return res.data.data;
}

export async function twoFactorChallenge(payload: {
  two_factor_token: string;
  code?: string;
  recovery_code?: string;
}) {
  const res = await api.post<ApiResponse<AuthTokens>>(ADMIN_ENDPOINTS.AUTH.TWO_FACTOR, payload);
  return res.data.data;
}

export async function fetchMe() {
  const res = await api.get<ApiResponse<AuthUser>>(ADMIN_ENDPOINTS.AUTH.ME);
  return res.data.data;
}

export async function logout() {
  await api.post(ADMIN_ENDPOINTS.AUTH.LOGOUT);
}

export async function forgotPassword(email: string) {
  const res = await api.post<ApiResponse<null>>(ADMIN_ENDPOINTS.AUTH.FORGOT_PASSWORD, { email });
  return res.data.message;
}

export async function resetPassword(payload: {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}) {
  const res = await api.post<ApiResponse<null>>(ADMIN_ENDPOINTS.AUTH.RESET_PASSWORD, payload);
  return res.data.message;
}
