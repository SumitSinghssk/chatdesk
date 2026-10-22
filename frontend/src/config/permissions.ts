export const PERM = {
  DASHBOARD_VIEW: "dashboard.view",

  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  USERS_MANAGE_SECURITY: "users.manage_security",

  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_CREATE: "customers.create",
  CUSTOMERS_UPDATE: "customers.update",
  CUSTOMERS_DELETE: "customers.delete",

  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",

  PERMISSIONS_VIEW: "permissions.view",
  PERMISSIONS_CREATE: "permissions.create",
  PERMISSIONS_DELETE: "permissions.delete",

  BLOG_CATEGORIES_VIEW: "blog_categories.view",
  BLOG_CATEGORIES_CREATE: "blog_categories.create",
  BLOG_CATEGORIES_UPDATE: "blog_categories.update",
  BLOG_CATEGORIES_DELETE: "blog_categories.delete",

  BLOGS_VIEW: "blogs.view",
  BLOGS_CREATE: "blogs.create",
  BLOGS_UPDATE: "blogs.update",
  BLOGS_DELETE: "blogs.delete",

  COMMENTS_VIEW: "comments.view",
  COMMENTS_MODERATE: "comments.moderate",
  COMMENTS_REPLY: "comments.reply",
  COMMENTS_DELETE: "comments.delete",

  PAGES_VIEW: "pages.view",
  PAGES_CREATE: "pages.create",
  PAGES_UPDATE: "pages.update",
  PAGES_DELETE: "pages.delete",

  TEAM_VIEW: "team.view",
  TEAM_CREATE: "team.create",
  TEAM_UPDATE: "team.update",
  TEAM_DELETE: "team.delete",

  TESTIMONIALS_VIEW: "testimonials.view",
  TESTIMONIALS_CREATE: "testimonials.create",
  TESTIMONIALS_UPDATE: "testimonials.update",
  TESTIMONIALS_DELETE: "testimonials.delete",

  GALLERIES_VIEW: "galleries.view",
  GALLERIES_CREATE: "galleries.create",
  GALLERIES_UPDATE: "galleries.update",
  GALLERIES_DELETE: "galleries.delete",

  MEDIA_VIEW: "media.view",
  MEDIA_UPLOAD: "media.upload",
  MEDIA_DELETE: "media.delete",

  MENUS_VIEW: "menus.view",
  MENUS_UPDATE: "menus.update",

  ENQUIRIES_VIEW: "enquiries.view",
  ENQUIRIES_CREATE: "enquiries.create",
  ENQUIRIES_UPDATE: "enquiries.update",
  ENQUIRIES_DELETE: "enquiries.delete",

  SEO_VIEW: "seo.view",
  SEO_CREATE: "seo.create",
  SEO_UPDATE: "seo.update",
  SEO_DELETE: "seo.delete",

  REDIRECTS_VIEW: "redirects.view",
  REDIRECTS_CREATE: "redirects.create",
  REDIRECTS_UPDATE: "redirects.update",
  REDIRECTS_DELETE: "redirects.delete",

  NOT_FOUND_VIEW: "not_found.view",
  NOT_FOUND_MANAGE: "not_found.manage",

  SETTINGS_VIEW: "settings.view",
  SETTINGS_UPDATE: "settings.update",

  ACTIVITY_LOGS_VIEW: "activity_logs.view",
  ACTIVITY_LOGS_CLEAR: "activity_logs.clear",

  NOTIFICATIONS_VIEW: "notifications.view",

  TRASH_VIEW: "trash.view",
  TRASH_RESTORE: "trash.restore",
  TRASH_DELETE: "trash.delete",

  LOGS_VIEW: "logs.view",
  LOGS_DELETE: "logs.delete",

  BACKUPS_VIEW: "backups.view",
  BACKUPS_CREATE: "backups.create",
  BACKUPS_DOWNLOAD: "backups.download",
  BACKUPS_DELETE: "backups.delete",
  BACKUPS_SETTINGS: "backups.settings",

  SYSTEM_HEALTH_VIEW: "system_health.view",
  SYSTEM_HEALTH_MANAGE: "system_health.manage",
} as const;

export type PermKey = (typeof PERM)[keyof typeof PERM];

const OWNS_ALL = "*";

export function hasPermission(permissions: readonly string[] | undefined, key?: string | string[]): boolean {
  if (!key || (Array.isArray(key) && key.length === 0)) return true;
  const owned = new Set(permissions ?? []);
  if (owned.has(OWNS_ALL)) return true;
  return Array.isArray(key) ? key.some((k) => owned.has(k)) : owned.has(key);
}
