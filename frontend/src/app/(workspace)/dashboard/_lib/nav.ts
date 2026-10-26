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
  UsersRound,
  Zap,
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
  | "automation"
  | "chatbots"
  | "ai-agent"
  | "commerce"
  | "analytics"
  | "whatsapp"
  | "team"
  | "account";

export type Role = "owner" | "admin" | "agent";
const MANAGERS: Role[] = ["owner", "admin"];

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
  /** Who can open it (everyone when left out) */
  roles?: Role[];
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
    status: "live",
    roles: MANAGERS,
    description: "Broadcast approved templates to your contacts, now or on a schedule.",
  },
  {
    key: "templates",
    label: "Templates",
    href: CUSTOMER_ROUTES.TEMPLATES(),
    icon: FileText,
    section: "grow",
    status: "live",
    roles: MANAGERS,
    description: "Create WhatsApp message templates and track Meta's approval.",
  },
  {
    key: "automation",
    label: "Automation",
    href: CUSTOMER_ROUTES.AUTOMATION(),
    icon: Zap,
    section: "grow",
    status: "live",
    roles: MANAGERS,
    description: "Welcome, away and keyword replies that answer customers 24/7, office hours and opt-out.",
  },
  {
    key: "chatbots",
    label: "Chatbots",
    href: CUSTOMER_ROUTES.CHATBOTS(),
    icon: Bot,
    section: "grow",
    status: "live",
    roles: MANAGERS,
    description: "Drag-and-drop conversation flows with buttons, lists, questions, conditions and API calls.",
  },
  {
    key: "ai-agent",
    label: "AI agent",
    href: CUSTOMER_ROUTES.AI_AGENT(),
    icon: Sparkles,
    section: "grow",
    status: "live",
    roles: MANAGERS,
    description:
      "An AI assistant trained on your documents, website and FAQs that answers on WhatsApp and your website.",
  },
  {
    key: "commerce",
    label: "Commerce",
    href: CUSTOMER_ROUTES.COMMERCE(),
    icon: ShoppingBag,
    section: "grow",
    status: "live",
    roles: MANAGERS,
    description: "Products and your WhatsApp catalog: send products, carts and orders in chats.",
  },
  {
    key: "analytics",
    label: "Analytics",
    href: CUSTOMER_ROUTES.ANALYTICS(),
    icon: BarChart3,
    section: "grow",
    status: "live",
    roles: MANAGERS,
    description: "Messages, chats, team response times, campaigns and automation in numbers.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp setup",
    href: CUSTOMER_ROUTES.WHATSAPP(),
    icon: MessageCircle,
    section: "settings",
    status: "live",
    roles: MANAGERS,
    description: "Connect your WhatsApp Business number through the Meta Cloud API.",
  },
  {
    key: "team",
    label: "Team",
    href: CUSTOMER_ROUTES.TEAM(),
    icon: UsersRound,
    section: "settings",
    status: "live",
    roles: MANAGERS,
    description: "Invite agents, group them in teams, set chat assignment rules and see response times.",
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

/** Can someone with `role` open this module? */
export function allowed(m: WorkspaceModule, role: Role): boolean {
  if (role === "agent" && m.status === "planned") return false; // agents only see what they work in
  return !m.roles || m.roles.includes(role);
}

/** The modules someone with `role` sees in the sidebar and search. */
export function modulesFor(role: Role): WorkspaceModule[] {
  return WORKSPACE_MODULES.filter((m) => allowed(m, role));
}

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
