import {
  CustomerApiError,
  request,
  type CustomerProfile,
  type Preferences,
} from "@/app/(customer)/_lib/customerApi";
import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { withQuery } from "@/config/routes/query";
import { BROWSER_API_BASE_URL } from "@/config/site";

const A = CUSTOMER_ENDPOINTS.ACCOUNT;
const headers = { Accept: "application/json", "X-Requested-With": "sk-web" };

export interface TwoFactorStatus {
  enabled: boolean;
  confirmed_at: string | null;
  recovery_left: number;
}

export interface SecurityOverview {
  two_factor: TwoFactorStatus;
  has_password: boolean;
  google_linked: boolean;
  phone_verified: boolean;
}

export interface LoginEvent {
  id: number;
  method: string;
  success: boolean;
  reason: string | null;
  ip_address: string | null;
  browser: string | null;
  platform: string | null;
  device: string | null;
  created_at: string;
}

export type NotifyEvent =
  | "chat_assigned"
  | "customer_waiting"
  | "ai_handover"
  | "campaign_finished"
  | "whatsapp_problem"
  | "new_order"
  | "payment_received";

export interface ChannelSet {
  in_app: boolean;
  email: boolean;
  browser: boolean;
}

export interface NotificationSettings {
  events: Partial<Record<NotifyEvent, ChannelSet & { label: string }>>;
  waiting_minutes: number;
}

export interface NotificationItem {
  id: number;
  event: NotifyEvent;
  title: string;
  body: string | null;
  url: string | null;
  browser: boolean;
  read: boolean;
  created_at: string;
}

async function upload<T>(path: string, form: FormData): Promise<{ data: T; message?: string }> {
  const res = await fetch(`${BROWSER_API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CustomerApiError(body.message ?? "Upload failed.", res.status, {});
  }
  return { data: body.data as T, message: body.message };
}

export const accountApi = {
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<CustomerProfile>(A.AVATAR, form);
  },
  removeAvatar: () => request<CustomerProfile>("DELETE", A.AVATAR),
  changeEmail: (body: { email: string; password?: string }) =>
    request<{ email: string; expires_in: number; dev_code?: string }>("POST", A.EMAIL, body),
  verifyEmail: (code: string) => request<CustomerProfile>("POST", A.EMAIL_VERIFY, { code }),
  cancelEmail: () => request<CustomerProfile>("DELETE", A.EMAIL),

  security: () => request<SecurityOverview>("GET", A.SECURITY),
  setupTwoFactor: () =>
    request<{ secret: string; uri: string; qr_svg: string }>("POST", A.TWO_FACTOR("setup")),
  confirmTwoFactor: (code: string) =>
    request<{ recovery_codes: string[]; two_factor: TwoFactorStatus }>("POST", A.TWO_FACTOR("confirm"), {
      code,
    }),
  newRecoveryCodes: (body: { password?: string; code?: string }) =>
    request<{ recovery_codes: string[]; two_factor: TwoFactorStatus }>(
      "POST",
      A.TWO_FACTOR("recovery-codes"),
      body
    ),
  disableTwoFactor: (body: { password?: string; code?: string }) =>
    request<TwoFactorStatus>("POST", A.TWO_FACTOR("disable"), body),
  loginHistory: () => request<LoginEvent[]>("GET", A.LOGIN_HISTORY),
  signOutOthers: () => request<{ count: number }>("DELETE", A.SESSIONS),
  linkGoogle: (credential: string) => request<CustomerProfile>("POST", A.GOOGLE, { credential }),
  unlinkGoogle: () => request<CustomerProfile>("DELETE", A.GOOGLE),

  preferences: () => request<Preferences>("GET", A.PREFERENCES),
  savePreferences: (body: Preferences) => request<Preferences>("PUT", A.PREFERENCES, body),
  notificationSettings: () => request<NotificationSettings>("GET", A.NOTIFICATION_SETTINGS),
  saveNotificationSettings: (body: { events: Record<string, ChannelSet>; waiting_minutes: number }) =>
    request<NotificationSettings>("PUT", A.NOTIFICATION_SETTINGS, body),
  notifications: (after?: number) =>
    request<{ unread: number; items: NotificationItem[] }>("GET", withQuery(A.NOTIFICATIONS, { after })),
  markRead: (body: { ids?: number[]; all?: boolean }) =>
    request<{ marked: number }>("POST", A.NOTIFICATIONS_READ, body),

  exportUrl: () => `${BROWSER_API_BASE_URL}${A.EXPORT}`,
  deleteAccount: (body: { confirm: string; password?: string; code?: string }) =>
    request<null>("POST", A.DELETE, body),
};

export const ACCOUNT_QK = {
  SECURITY: ["account", "security"] as const,
  HISTORY: ["account", "login-history"] as const,
  SESSIONS: ["account", "sessions"] as const,
  NOTIFY: ["account", "notification-settings"] as const,
  FEED: ["account", "notifications"] as const,
};
