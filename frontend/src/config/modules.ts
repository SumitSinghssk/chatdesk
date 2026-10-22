import {
  Activity,
  Bell,
  FileText,
  Folder,
  Globe,
  HeartPulse,
  Image,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MessagesSquare,
  Newspaper,
  Save,
  ScrollText,
  Settings,
  ShieldCheck,
  Signpost,
  Tag,
  Trash2,
  TriangleAlert,
  UserRound,
  UserRoundCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { PERM } from "./permissions";
import type { QueryParams } from "./routes/query";

export type WorkspaceKey = "admin" | "website";
export type SectionKey = "overview" | "people" | "tools" | "content" | "media" | "seo" | "navigation";
export type BadgeKey = "enquiries" | "systemHealth";

export interface AdminModule {
  label: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
  section?: SectionKey;
  workspace?: WorkspaceKey;
  parent?: string;
  badge?: BadgeKey;
  badgeTone?: "primary" | "danger";
  create?: { label: string; query: QueryParams; permission: string; order: number };
}

const defineModules = <T extends Record<string, AdminModule>>(modules: T) => modules;

export const ADMIN_MODULES = defineModules({
  DASHBOARD: {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: LayoutDashboard,
    permission: PERM.DASHBOARD_VIEW,
    section: "overview",
  },
  ENQUIRIES: {
    label: "Enquiries",
    path: "/admin/enquiries",
    icon: Inbox,
    permission: PERM.ENQUIRIES_VIEW,
    section: "overview",
    badge: "enquiries",
  },

  USERS: {
    label: "Users",
    path: "/admin/users",
    icon: Users,
    permission: PERM.USERS_VIEW,
    section: "people",
    create: { label: "User", query: { action: "create" }, permission: PERM.USERS_CREATE, order: 8 },
  },
  CUSTOMERS: {
    label: "Customers",
    path: "/admin/customers",
    icon: UserRoundCheck,
    permission: PERM.CUSTOMERS_VIEW,
    section: "people",
    create: { label: "Customer", query: { action: "create" }, permission: PERM.CUSTOMERS_CREATE, order: 8.5 },
  },
  ROLES: {
    label: "Roles & Permissions",
    path: "/admin/roles",
    icon: ShieldCheck,
    permission: PERM.ROLES_VIEW,
    section: "people",
  },

  SETTINGS: {
    label: "Settings",
    path: "/admin/settings",
    icon: Settings,
    permission: PERM.SETTINGS_VIEW,
    section: "tools",
  },
  ACTIVITY_LOGS: {
    label: "Activity Logs",
    path: "/admin/activity-logs",
    icon: Activity,
    permission: PERM.ACTIVITY_LOGS_VIEW,
    section: "tools",
  },
  BACKUPS: {
    label: "Backups",
    path: "/admin/backups",
    icon: Save,
    permission: PERM.BACKUPS_VIEW,
    section: "tools",
  },
  TRASH: {
    label: "Trash",
    path: "/admin/trash",
    icon: Trash2,
    permission: PERM.TRASH_VIEW,
    section: "tools",
  },
  SYSTEM_HEALTH: {
    label: "System health",
    path: "/admin/system-health",
    icon: HeartPulse,
    permission: PERM.SYSTEM_HEALTH_VIEW,
    section: "tools",
    badge: "systemHealth",
    badgeTone: "danger",
  },

  BLOGS: {
    label: "Blogs",
    path: "/admin/blogs",
    icon: Newspaper,
    permission: PERM.BLOGS_VIEW,
    section: "content",
    create: { label: "Blog post", query: { open: "new" }, permission: PERM.BLOGS_CREATE, order: 1 },
  },
  BLOG_CATEGORIES: {
    label: "Categories",
    path: "/admin/blog-categories",
    icon: Tag,
    permission: PERM.BLOG_CATEGORIES_VIEW,
    section: "content",
    create: {
      label: "Blog category",
      query: { action: "create" },
      permission: PERM.BLOG_CATEGORIES_CREATE,
      order: 5,
    },
  },
  COMMENTS: {
    label: "Comments",
    path: "/admin/comments",
    icon: MessagesSquare,
    permission: PERM.COMMENTS_VIEW,
    workspace: "website",
    parent: "/admin/blogs",
  },
  PAGES: {
    label: "Pages",
    path: "/admin/pages",
    icon: FileText,
    permission: PERM.PAGES_VIEW,
    section: "content",
    create: { label: "Page", query: { open: "new" }, permission: PERM.PAGES_CREATE, order: 2 },
  },
  TEAM: {
    label: "Team members",
    path: "/admin/team",
    icon: UsersRound,
    permission: PERM.TEAM_VIEW,
    section: "content",
    create: { label: "Team member", query: { action: "create" }, permission: PERM.TEAM_CREATE, order: 4.5 },
  },
  TESTIMONIALS: {
    label: "Testimonials",
    path: "/admin/testimonials",
    icon: MessageSquare,
    permission: PERM.TESTIMONIALS_VIEW,
    section: "content",
    create: {
      label: "Testimonial",
      query: { action: "create" },
      permission: PERM.TESTIMONIALS_CREATE,
      order: 4,
    },
  },

  MEDIA: {
    label: "Media Library",
    path: "/admin/media",
    icon: Folder,
    permission: PERM.MEDIA_VIEW,
    section: "media",
  },
  GALLERIES: {
    label: "Gallery",
    path: "/admin/galleries",
    icon: Image,
    permission: PERM.GALLERIES_VIEW,
    section: "media",
    create: {
      label: "Gallery album",
      query: { action: "create" },
      permission: PERM.GALLERIES_CREATE,
      order: 3,
    },
  },

  SEO: {
    label: "SEO",
    path: "/admin/seo",
    icon: Globe,
    permission: PERM.SEO_VIEW,
    section: "seo",
    create: { label: "SEO record", query: { action: "create" }, permission: PERM.SEO_CREATE, order: 6 },
  },
  REDIRECTS: {
    label: "Redirects",
    path: "/admin/redirects",
    icon: Signpost,
    permission: PERM.REDIRECTS_VIEW,
    section: "seo",
    create: { label: "Redirect", query: { action: "create" }, permission: PERM.REDIRECTS_CREATE, order: 7 },
  },
  NOT_FOUND: {
    label: "404 Errors",
    path: "/admin/not-found",
    icon: TriangleAlert,
    permission: PERM.NOT_FOUND_VIEW,
    section: "seo",
  },

  MENUS: {
    label: "Menus",
    path: "/admin/menus",
    icon: Menu,
    permission: PERM.MENUS_VIEW,
    section: "navigation",
  },

  PROFILE: { label: "My profile", path: "/admin/profile", icon: UserRound },
  NOTIFICATIONS: { label: "Notifications", path: "/admin/notifications", icon: Bell },
  LOGS: {
    label: "Application logs",
    path: "/admin/logs",
    icon: ScrollText,
    permission: PERM.LOGS_VIEW,
    workspace: "admin",
  },
});

export type AdminModuleKey = keyof typeof ADMIN_MODULES;
