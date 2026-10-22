import {
  BarChart3,
  Bot,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Rocket,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRoundCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { CUSTOMER_ROUTES } from "@/config/routes";

export type ModuleKey =
  | "overview"
  | "inbox"
  | "contacts"
  | "campaigns"
  | "templates"
  | "chatbots"
  | "ai-agent"
  | "commerce"
  | "analytics"
  | "whatsapp"
  | "account";

export interface WorkspaceModule {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
  section: "main" | "grow" | "settings";
  /** "live" = working now; "planned" = shows the module's roadmap page. */
  status: "live" | "planned";
  /** Live count shown next to the menu item (see CustomerShell). */
  badge?: "inbox";
  /** Build phase from WHATSAPP_PLATFORM_BLUEPRINT.md */
  phase?: string;
  description: string;
  features?: string[];
}

// One entry per workspace screen. The sidebar and every "planned" page are built from this list,
// so adding a module = one entry here + a page.tsx under app/(workspace)/dashboard/<key>/.
export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    key: "overview",
    label: "Overview",
    href: CUSTOMER_ROUTES.DASHBOARD(),
    icon: LayoutDashboard,
    section: "main",
    status: "live",
    description: "Your WhatsApp number, setup progress and activity at a glance.",
  },
  {
    key: "inbox",
    label: "Team inbox",
    href: CUSTOMER_ROUTES.INBOX(),
    icon: Inbox,
    section: "main",
    status: "live",
    badge: "inbox",
    description: "Every WhatsApp conversation in one shared, real-time inbox.",
    features: [
      "Live chat with text, media, buttons and lists",
      "Assign chats to agents or teams, auto-assignment",
      "Internal notes, quick replies and labels",
      "24-hour window timer and template sending",
      "Open / pending / resolved filters and search",
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    href: CUSTOMER_ROUTES.CONTACTS(),
    icon: Users,
    section: "main",
    status: "live",
    description: "Your customer list with tags, attributes and opt-in status.",
    features: [
      "CSV import and export",
      "Tags and custom attributes",
      "Opt-in / opt-out tracking",
      "Segments for campaigns",
    ],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    href: CUSTOMER_ROUTES.CAMPAIGNS(),
    icon: Megaphone,
    section: "grow",
    status: "planned",
    phase: "Phase 2",
    description: "Broadcasts, retargeting and drip sequences.",
    features: [
      "Send approved templates to segments",
      "Schedule with time zones and see the cost first",
      "Retarget people who read, clicked or replied",
      "Drip sequences that stop when the customer replies",
      "Delivery, read, click and reply reports",
    ],
  },
  {
    key: "templates",
    label: "Templates",
    href: CUSTOMER_ROUTES.TEMPLATES(),
    icon: FileText,
    section: "grow",
    status: "live",
    description: "Create WhatsApp message templates and track Meta's approval.",
  },
  {
    key: "chatbots",
    label: "Chatbots",
    href: CUSTOMER_ROUTES.CHATBOTS(),
    icon: Bot,
    section: "grow",
    status: "planned",
    phase: "Phase 2–4",
    description: "Keyword replies and no-code flows that run 24/7.",
    features: [
      "Welcome, away and keyword replies",
      "Drag-and-drop flow builder",
      "Questions, conditions, delays and API calls",
      "Hand over to a human with context",
    ],
  },
  {
    key: "ai-agent",
    label: "AI agent",
    href: CUSTOMER_ROUTES.AI_AGENT(),
    icon: Sparkles,
    section: "grow",
    status: "planned",
    phase: "Phase 3",
    description: "An AI assistant trained on your website and documents.",
    features: [
      "Knowledge base from URLs, PDFs and FAQs",
      "Order status, bookings and CRM lookups",
      "Multi-language replies",
      "Escalates to your team when unsure",
    ],
  },
  {
    key: "commerce",
    label: "Commerce",
    href: CUSTOMER_ROUTES.COMMERCE(),
    icon: ShoppingBag,
    section: "grow",
    status: "planned",
    phase: "Phase 3",
    description: "Catalog, orders and payments inside WhatsApp.",
    features: [
      "WhatsApp catalog and product messages",
      "Payment links (Razorpay / PayU)",
      "Shopify and WooCommerce abandoned-cart recovery",
      "COD-to-prepaid and order updates",
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    href: CUSTOMER_ROUTES.ANALYTICS(),
    icon: BarChart3,
    section: "grow",
    status: "planned",
    phase: "Phase 2–4",
    description: "Messages, campaigns, agents and ads in numbers.",
    features: [
      "Message volume and Meta cost",
      "Campaign funnel",
      "Agent response and resolution times",
      "Click-to-WhatsApp ad attribution",
    ],
  },
  {
    key: "whatsapp",
    label: "WhatsApp setup",
    href: CUSTOMER_ROUTES.WHATSAPP(),
    icon: MessageCircle,
    section: "settings",
    status: "live",
    description: "Connect your WhatsApp Business number through the Meta Cloud API.",
  },
  {
    key: "account",
    label: "Account",
    href: CUSTOMER_ROUTES.ACCOUNT(),
    icon: UserRoundCog,
    section: "settings",
    status: "live",
    description: "Your profile, password, phone and signed-in devices.",
  },
];

export const NAV_SECTIONS: { key: WorkspaceModule["section"]; label: string; icon: LucideIcon }[] = [
  { key: "main", label: "Workspace", icon: LayoutDashboard },
  { key: "grow", label: "Grow", icon: Rocket },
  { key: "settings", label: "Settings", icon: Settings },
];

export function getModule(key: ModuleKey): WorkspaceModule {
  const found = WORKSPACE_MODULES.find((m) => m.key === key);
  if (!found) throw new Error(`Unknown workspace module: ${key}`);
  return found;
}

/** The module whose page is open at `pathname` (deepest match wins). */
export function moduleFor(pathname: string): WorkspaceModule | undefined {
  return [...WORKSPACE_MODULES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));
}

export function moduleByHref(href: string): WorkspaceModule | undefined {
  return WORKSPACE_MODULES.find((m) => m.href === href);
}

export function breadcrumbsFor(pathname: string): { label: string; href?: string }[] {
  const current = moduleFor(pathname);
  if (!current || current.key === "overview") return [{ label: "Overview" }];
  const section = NAV_SECTIONS.find((s) => s.key === current.section);
  return [
    { label: "Overview", href: CUSTOMER_ROUTES.DASHBOARD() },
    ...(section && section.key !== "main" ? [{ label: section.label }] : []),
    { label: current.label },
  ];
}
