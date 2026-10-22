import { CUSTOMER_ENDPOINTS } from "@/config/endpoints/customer";
import { BROWSER_API_BASE_URL } from "@/config/site";

export interface AuthOptions {
  password: boolean;
  otp: boolean;
  google: boolean;
  registration: boolean;
  google_client_id: string | null;
  otp_length: number;
  otp_resend_seconds: number;
  default_country_code: string;
  sms_ready: boolean;
  phone_verification: boolean;
}

export interface CustomerProfile {
  id: number;
  name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  has_password: boolean;
  google_linked: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  signup_method: "password" | "otp" | "google" | "admin" | "invite";
  last_login_at: string | null;
  created_at: string;
  /** Team: this person's role in the workspace they work in */
  role: "owner" | "admin" | "agent";
  availability: "available" | "away";
  workspace: { id: number; name: string | null };
}

export interface CustomerDevice {
  id: number;
  method: string | null;
  ip_address: string | null;
  browser: string | null;
  platform: string | null;
  device: string | null;
  created_at: string;
  last_active_at: string;
  current: boolean;
}

export interface OtpSent {
  expires_in: number;
  resend_in: number;
  length: number;
  phone: string;
  is_new?: boolean;
}

interface Envelope<T> {
  status: boolean;
  message?: string;
  data: T;
  errors?: Record<string, string[]>;
}

export class CustomerApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Record<string, string> = {},
    public data: unknown = null
  ) {
    super(message);
  }
}

export async function request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${BROWSER_API_BASE_URL}${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "sk-web",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CustomerApiError("Can't reach the server. Please try again in a moment.", 0);
  }
  const json = (await res.json().catch(() => ({}))) as Partial<Envelope<T>>;
  if (!res.ok) {
    const errors = Object.fromEntries(Object.entries(json.errors ?? {}).map(([k, v]) => [k, v[0] ?? ""]));
    throw new CustomerApiError(
      json.message ?? "Something went wrong. Please try again.",
      res.status,
      errors,
      json.data ?? null
    );
  }
  return { message: json.message, data: json.data as T };
}

const A = CUSTOMER_ENDPOINTS.AUTH;
const C = CUSTOMER_ENDPOINTS.ACCOUNT;

export const customerApi = {
  options: () => request<AuthOptions>("GET", A.OPTIONS),
  register: (body: {
    name: string;
    business_name?: string;
    email: string;
    phone?: string;
    password: string;
    password_confirmation: string;
  }) => request<{ customer: CustomerProfile }>("POST", A.REGISTER, body),
  login: (body: { login: string; password: string }) =>
    request<{ customer: CustomerProfile }>("POST", A.LOGIN, body),
  sendOtp: (phone: string) => request<OtpSent>("POST", A.OTP_SEND, { phone }),
  verifyOtp: (body: { phone: string; code: string; name?: string }) =>
    request<{ customer: CustomerProfile }>("POST", A.OTP_VERIFY, body),
  google: (credential: string) => request<{ customer: CustomerProfile }>("POST", A.GOOGLE, { credential }),
  logout: () => request<null>("POST", A.LOGOUT),

  me: () => request<CustomerProfile>("GET", C.ME),
  updateProfile: (body: { name: string; business_name: string | null; email: string | null }) =>
    request<CustomerProfile>("PUT", C.PROFILE, body),
  updatePassword: (body: { current_password?: string; password: string; password_confirmation: string }) =>
    request<CustomerProfile>("PUT", C.PASSWORD, body),
  sendPhoneCode: (phone: string) => request<OtpSent>("POST", C.PHONE_SEND, { phone }),
  verifyPhone: (body: { phone: string; code: string }) =>
    request<CustomerProfile>("POST", C.PHONE_VERIFY, body),
  sessions: () => request<CustomerDevice[]>("GET", C.SESSIONS),
  revokeSession: (id: number) => request<null>("DELETE", C.SESSION(id)),
};

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function safeNext(next: string | null | undefined, fallback: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/^\/(login|register|admin)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
