import { getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

export type EmailTemplateField = "subject" | "heading" | "body" | "button" | "note";
export type EmailTemplateValues = Partial<Record<EmailTemplateField, string>>;

export interface EmailTemplate {
  key: string;
  group: string;
  label: string;
  description: string;
  optional: boolean;
  warn: boolean;
  enabled: boolean;
  fields: EmailTemplateField[];
  hints: Partial<Record<EmailTemplateField, string>>;
  placeholders: { name: string; label: string }[];
  values: EmailTemplateValues;
  defaults: EmailTemplateValues;
  customised: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface EmailDesign {
  accent: string;
  footer: string;
  show_logo: boolean;
}

export interface EmailTemplatesData {
  groups: { key: string; label: string }[];
  templates: EmailTemplate[];
  design: EmailDesign;
}

export interface EmailPreview {
  subject: string;
  html: string;
  unknown: string[];
}

const E = ADMIN_ENDPOINTS.EMAIL_TEMPLATES;

export const emailTemplatesApi = {
  list: () => getOne<EmailTemplatesData>(E.LIST),
  update: (key: string, payload: EmailTemplateValues & { enabled?: boolean }) =>
    send<EmailTemplate>("put", E.UPDATE(key), payload),
  restore: (key: string) => send<EmailTemplate>("delete", E.RESTORE(key)),
  design: (payload: EmailDesign) => send<EmailDesign>("put", E.DESIGN, payload),
  async preview(key: string, values?: EmailTemplateValues) {
    return (await send<EmailPreview>("post", E.PREVIEW(key), { values: values ?? null })).data;
  },
  test: (key: string, values?: EmailTemplateValues) =>
    send<null>("post", E.TEST(key), { values: values ?? null }),
};
