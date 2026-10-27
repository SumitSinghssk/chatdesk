import { route } from "./query";

export const CUSTOMER_ROUTES = {
  LOGIN: route("/login"),
  REGISTER: route("/register"),
  // Customer workspace (the WhatsApp app). Sidebar: app/(workspace)/dashboard/_lib/nav.ts
  DASHBOARD: route("/dashboard"),
  INBOX: route("/dashboard/inbox"),
  CONTACTS: route("/dashboard/contacts"),
  DIAGRAMS: route("/dashboard/diagrams"),
  DIAGRAM: (id: number) => `/dashboard/diagrams/${id}`,
  /** a diagram shared by link, for people outside the workspace */
  SHARED_DIAGRAM: (token: string) => `/d/${token}`,
  CAMPAIGNS: route("/dashboard/campaigns"),
  CAMPAIGN_NEW: route("/dashboard/campaigns/new"),
  CAMPAIGN: (id: number) => `/dashboard/campaigns/${id}`,
  CAMPAIGN_EDIT: (id: number) => `/dashboard/campaigns/${id}/edit`,
  TEMPLATES: route("/dashboard/templates"),
  TEMPLATE_NEW: route("/dashboard/templates/new"),
  TEMPLATE_EDIT: (id: number) => `/dashboard/templates/${id}/edit`,
  AUTOMATION: route("/dashboard/automation"),
  CHATBOTS: route("/dashboard/chatbots"),
  CHATBOT: (id: number) => `/dashboard/chatbots/${id}`,
  AI_AGENT: route("/dashboard/ai-agent"),
  AI_AGENT_DETAIL: (id: number, tab?: string) => `/dashboard/ai-agent/${id}${tab ? `?tab=${tab}` : ""}`,
  COMMERCE: route("/dashboard/commerce"),
  COMMERCE_PRODUCT_NEW: route("/dashboard/commerce/products/new"),
  COMMERCE_PRODUCT: (id: number) => `/dashboard/commerce/products/${id}`,
  COMMERCE_ORDER_NEW: route("/dashboard/commerce/orders/new"),
  COMMERCE_ORDER: (id: number) => `/dashboard/commerce/orders/${id}`,
  ANALYTICS: route("/dashboard/analytics"),
  WHATSAPP: route("/dashboard/whatsapp"),
  INTEGRATIONS: route("/dashboard/integrations"),
  DOCS: route("/docs"),
  TEAM: route("/dashboard/team"),
  INVITE: (token: string) => `/invite/${token}`,
  ACCOUNT: route("/dashboard/account"),
} as const;

export const CUSTOMER_GUEST_PATHS = [CUSTOMER_ROUTES.LOGIN.path, CUSTOMER_ROUTES.REGISTER.path];
export const CUSTOMER_PRIVATE_PATHS = [CUSTOMER_ROUTES.DASHBOARD.path];
export const CUSTOMER_SESSION_COOKIE = "sk_customer";
export const CUSTOMER_HINT_COOKIE = "sk_member";
