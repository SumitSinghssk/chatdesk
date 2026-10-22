import { ADMIN_MODULES, type AdminModuleKey } from "../modules";
import { route, type PageRoute } from "./query";

const AUTH_ROUTES = {
  ROOT: route("/admin"),
  LOGIN: route("/admin/login"),
  TWO_FACTOR: route("/admin/two-factor"),
  FORGOT_PASSWORD: route("/admin/forgot-password"),
  RESET_PASSWORD: route("/admin/reset-password"),
};

const MODULE_ROUTES = Object.fromEntries(
  Object.entries(ADMIN_MODULES).map(([key, module]) => [key, route(module.path)])
) as Record<AdminModuleKey, PageRoute>;

export const ADMIN_ROUTES = { ...AUTH_ROUTES, ...MODULE_ROUTES };

export const PUBLIC_ADMIN_PATHS = [
  ADMIN_ROUTES.LOGIN.path,
  ADMIN_ROUTES.FORGOT_PASSWORD.path,
  ADMIN_ROUTES.RESET_PASSWORD.path,
  ADMIN_ROUTES.TWO_FACTOR.path,
];
