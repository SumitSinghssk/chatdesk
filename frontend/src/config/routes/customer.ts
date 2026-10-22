import { route } from "./query";

export const CUSTOMER_ROUTES = {
  LOGIN: route("/login"),
  REGISTER: route("/register"),
  // Customer workspace (the WhatsApp app). Sidebar: app/(workspace)/dashboard/_lib/nav.ts
  DASHBOARD: route("/dashboard"),
  INBOX: route("/dashboard/inbox"),
  CONTACTS: route("/dashboard/contacts"),
  CAMPAIGNS: route("/dashboard/campaigns"),
  CAMPAIGN_NEW: route("/dashboard/campaigns/new"),
  CAMPAIGN: (id: number) => `/dashboard/campaigns/${id}`,
  CAMPAIGN_EDIT: (id: number) => `/dashboard/campaigns/${id}/edit`,
  TEMPLATES: route("/dashboard/templates"),
  TEMPLATE_NEW: route("/dashboard/templates/new"),
  TEMPLATE_EDIT: (id: number) => `/dashboard/templates/${id}/edit`,
  CHATBOTS: route("/dashboard/chatbots"),
  AI_AGENT: route("/dashboard/ai-agent"),
  COMMERCE: route("/dashboard/commerce"),
  ANALYTICS: route("/dashboard/analytics"),
  WHATSAPP: route("/dashboard/whatsapp"),
  TEAM: route("/dashboard/team"),
  INVITE: (token: string) => `/invite/${token}`,
  ACCOUNT: route("/dashboard/account"),
} as const;

export const CUSTOMER_GUEST_PATHS = [CUSTOMER_ROUTES.LOGIN.path, CUSTOMER_ROUTES.REGISTER.path];
export const CUSTOMER_PRIVATE_PATHS = [CUSTOMER_ROUTES.DASHBOARD.path];
export const CUSTOMER_SESSION_COOKIE = "sk_customer";
export const CUSTOMER_HINT_COOKIE = "sk_member";
