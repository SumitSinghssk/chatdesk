import { getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

export interface GeneralSettings {
  app_name: string;
  tagline: string;
  logo_light: string | null;
  logo_dark: string | null;
  favicon: string | null;
  addresses: { label: string; text: string; map_iframe: string | null }[];
  phones: string[];
  emails: string[];
  social_links: { platform: string; url: string }[];
  footer_text: string;
}

export interface DateTimeSettings {
  timezone: string;
  date_format: string;
  time_format: string;
}

export interface SecuritySettings {
  lockout_enabled: boolean;
  lockout_attempts: number;
  lockout_minutes: number;
  idle_minutes: number;
  access_token_minutes: number;
  refresh_token_days: number;
  remember_days: number;
  password_reset_minutes: number;
  password_min_length: number;
  login_per_minute: number;
}

export type MailEncryption = "tls" | "ssl" | "none";

export interface MailSettings {
  enabled: boolean;
  host: string;
  port: number;
  encryption: MailEncryption;
  username: string;
  password?: string | null;
  has_password?: boolean;
  from_address: string;
  from_name: string;
  reply_to: string;
}

export interface ScriptsSettings {
  header_scripts: string;
  footer_scripts: string;
  custom_css: string;
}

export interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  message: string;
  ends_at: string | null;
}

export interface CommentsSettings {
  enabled: boolean;
  allow_replies: boolean;
  max_depth: number;
  notify_admins: boolean;
  close_after_days: number;
}

export interface CustomerAuthSettings {
  password_enabled: boolean;
  otp_enabled: boolean;
  google_enabled: boolean;
  allow_registration: boolean;
  google_client_id: string;
  otp_length: number;
  otp_expiry_minutes: number;
  otp_resend_seconds: number;
  otp_max_attempts: number;
  session_days: number;
}

export interface RobotsSettings {
  content: string;
}

export interface AllSettings {
  general: GeneralSettings;
  date_time: DateTimeSettings;
  security: SecuritySettings;
  mail: MailSettings;
  scripts: ScriptsSettings;
  maintenance: MaintenanceSettings;
  comments: CommentsSettings;
  customer_auth: CustomerAuthSettings;
  robots: RobotsSettings;
}

export type SettingsGroup = keyof AllSettings;

const E = ADMIN_ENDPOINTS.SETTINGS;

export const settingsApi = {
  all: () => getOne<AllSettings>(E.ALL),
  group: <K extends SettingsGroup>(key: K) => getOne<AllSettings[K]>(E.GROUP(key)),
  update: <K extends SettingsGroup>(key: K, data: AllSettings[K]) =>
    send<AllSettings[K]>("put", E.GROUP(key), data),
  mailTest: (to: string) => send<null>("post", E.MAIL_TEST, { to }),
};
