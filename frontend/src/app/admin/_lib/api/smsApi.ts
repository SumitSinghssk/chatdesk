import { getOne, getPage, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";
import type { ListParams } from "./types";

export interface SmsGatewayField {
  name: string;
  label: string;
  required: boolean;
  secret: boolean;
  default: string;
  help: string;
  options: { value: string; label: string }[];
}

export interface SmsGatewaySpec {
  key: string;
  label: string;
  website: string;
  fields: SmsGatewayField[];
  template_id_label: string | null;
  template_id_help: string;
}

export interface SmsTemplateSpec {
  key: string;
  label: string;
  description: string;
  body: string;
  variables: string[];
}

export type SmsGatewayValues = Record<string, string | boolean | null>;

export type SmsTemplateValues = Record<string, { body: string; template_ids: Record<string, string> }>;

export interface SmsSettings {
  default_country_code: string;
  order: string[];
  gateways: Record<string, SmsGatewayValues>;
  templates: SmsTemplateValues;
}

export interface SmsConfig {
  settings: SmsSettings;
  gateways: SmsGatewaySpec[];
  templates: SmsTemplateSpec[];
}

export interface SmsAttempt {
  gateway: string;
  ok: boolean;
  error?: string;
}

export interface SmsTestResult {
  sent: boolean;
  gateway: string | null;
  attempts: SmsAttempt[];
  error: string | null;
}

export interface SmsLog {
  id: number;
  phone: string;
  template_key: string | null;
  template: string | null;
  message: string | null;
  gateway: string | null;
  gateway_label: string | null;
  status: "sent" | "failed" | "skipped";
  message_id: string | null;
  attempts: SmsAttempt[];
  error: string | null;
  created_at: string;
}

const E = ADMIN_ENDPOINTS.SMS;

export const smsApi = {
  show: () => getOne<SmsConfig>(E.SHOW),
  update: (data: Omit<SmsSettings, "templates">) => send<SmsConfig>("put", E.UPDATE, data),
  updateTemplates: (templates: SmsTemplateValues) => send<SmsConfig>("put", E.TEMPLATES, { templates }),
  test: (phone: string, gateway?: string) => send<SmsTestResult>("post", E.TEST, { phone, gateway }),
  logs: (params: ListParams, signal?: AbortSignal) => getPage<SmsLog>(E.LOGS, params, signal),
};
