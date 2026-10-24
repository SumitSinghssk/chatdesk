import {
  Globe,
  Image,
  LayoutDashboard,
  Menu,
  Newspaper,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  ADMIN_MODULES,
  type AdminModule,
  type BadgeKey,
  type SectionKey,
  type WorkspaceKey,
} from "./modules";
import { ADMIN_ROUTES } from "./routes/admin";
import { withQuery } from "./routes/query";

export type { BadgeKey, WorkspaceKey };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string | string[];
  badge?: BadgeKey;
  badgeTone?: "primary" | "danger";
}

export interface NavSection {
  key: SectionKey;
  workspace: WorkspaceKey;
  label: string;
  icon: LucideIcon;
  collapsible?: boolean;
  items: NavItem[];
}

export const workspaces: Record<WorkspaceKey, { label: string; subtitle: string; icon: LucideIcon }> = {
  admin: { label: "Admin", subtitle: "Admin workspace", icon: LayoutDashboard },
  website: { label: "Website", subtitle: "Website workspace", icon: Globe },
};

const SECTIONS: Omit<NavSection, "items">[] = [
  { key: "overview", workspace: "admin", label: "Overview", icon: LayoutDashboard, collapsible: false },
  { key: "people", workspace: "admin", label: "People & access", icon: Users },
  { key: "tools", workspace: "admin", label: "System", icon: Settings },
  { key: "content", workspace: "website", label: "Content", icon: Newspaper },
  { key: "media", workspace: "website", label: "Media", icon: Image },
  { key: "seo", workspace: "website", label: "SEO & traffic", icon: Globe },
  { key: "navigation", workspace: "website", label: "Navigation", icon: Menu },
];

const modules = Object.values(ADMIN_MODULES) as AdminModule[];

const toItem = (m: AdminModule): NavItem => ({
  label: m.label,
  href: m.path,
  icon: m.icon,
  permission: m.permission,
  badge: m.badge,
  badgeTone: m.badgeTone,
});

export const navSections: NavSection[] = SECTIONS.map((section) => ({
  ...section,
  items: modules.filter((m) => m.section === section.key).map(toItem),
}));

export const workspaceOf = (m: AdminModule): WorkspaceKey | undefined =>
  m.workspace ?? SECTIONS.find((s) => s.key === m.section)?.workspace;

export const quickCreate: {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
  workspace?: WorkspaceKey;
}[] = modules
  .filter((m) => m.create)
  .sort((a, b) => a.create!.order - b.create!.order)
  .map((m) => ({
    label: m.create!.label,
    href: withQuery(m.path, m.create!.query),
    icon: m.icon,
    permission: m.create!.permission,
    workspace: workspaceOf(m),
  }));

const allItems = () => navSections.flatMap((s) => s.items.map((item) => ({ item, section: s })));

function findEntry(pathname: string) {
  return allItems()
    .filter(({ item }) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.item.href.length - a.item.href.length)[0];
}

function childModule(pathname: string) {
  return modules
    .filter((m) => m.parent && (pathname === m.path || pathname.startsWith(`${m.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export function findNavItem(pathname: string): NavItem | undefined {
  const entry = findEntry(pathname);
  if (entry) return entry.item;
  const child = childModule(pathname);
  return child?.parent ? findEntry(child.parent)?.item : undefined;
}

export function workspaceFor(pathname: string): WorkspaceKey | null {
  const entry = findEntry(pathname);
  if (entry) return entry.section.workspace;

  const module = modules
    .filter((m) => pathname === m.path || pathname.startsWith(`${m.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  return module ? (workspaceOf(module) ?? null) : null;
}

function pageLabel(pathname: string) {
  return modules.find((m) => m.path === pathname)?.label;
}

export function breadcrumbsFor(pathname: string): { label: string; href?: string }[] {
  const dashboard = ADMIN_ROUTES.DASHBOARD.path;
  if (pathname === dashboard) return [{ label: ADMIN_MODULES.DASHBOARD.label }];
  const crumbs: { label: string; href?: string }[] = [
    { label: ADMIN_MODULES.DASHBOARD.label, href: dashboard },
  ];
  const entry = findEntry(pathname);
  const child = entry ? undefined : childModule(pathname);
  const parent = child?.parent ? findEntry(child.parent) : undefined;
  if (child && parent) {
    if (parent.section.key !== "overview") crumbs.push({ label: parent.section.label });
    crumbs.push({ label: parent.item.label, href: parent.item.href }, { label: child.label });
    return crumbs;
  }
  const label = entry?.item.label ?? pageLabel(pathname);
  if (entry && entry.section.key !== "overview") crumbs.push({ label: entry.section.label });
  if (label) crumbs.push({ label, href: entry?.item.href ?? pathname });
  const rest = entry ? pathname.slice(entry.item.href.length).split("/").filter(Boolean) : [];
  if (rest.includes("create")) crumbs.push({ label: "Create" });
  else if (rest.includes("edit")) crumbs.push({ label: "Edit" });
  else if (rest.length) crumbs.push({ label: "Details" });
  const last = crumbs[crumbs.length - 1]!;
  delete last.href;
  return crumbs;
}

export interface PageInfo {
  path: string;
  label: string;
  icon: LucideIcon;
  /** undefined = shared page (profile, notifications) that opens in the current workspace. */
  workspace?: WorkspaceKey;
}

export function pageFor(pathname: string): PageInfo | undefined {
  return modules
    .filter((m) => pathname === m.path || pathname.startsWith(`${m.path}/`))
    .sort((a, b) => b.path.length - a.path.length)
    .map((m) => ({ path: m.path, label: m.label, icon: m.icon, workspace: workspaceOf(m) }))[0];
}

export function pageByPath(path: string): PageInfo | undefined {
  const m = modules.find((x) => x.path === path);
  return m && { path: m.path, label: m.label, icon: m.icon, workspace: workspaceOf(m) };
}

export const allNavItems = (): (NavItem & { section: string; workspace: WorkspaceKey })[] =>
  navSections.flatMap((s) => s.items.map((item) => ({ ...item, section: s.label, workspace: s.workspace })));
