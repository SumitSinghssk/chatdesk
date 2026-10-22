import { getList, getOne, send } from "./crud";
import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

export interface MenuItemNode {
  id?: number;
  label: string;
  url: string;
  new_tab: boolean;
  is_active: boolean;
  children: MenuItemNode[];
}

export interface MenuSummary {
  id: number;
  key: string;
  name: string;
  items_count: number;
  updated_at: string | null;
}

export interface Menu extends MenuSummary {
  items: MenuItemNode[];
}

const E = ADMIN_ENDPOINTS.MENUS;

export const menusApi = {
  list: () => getList<MenuSummary>(E.LIST),
  get: (key: string) => getOne<Menu>(E.SHOW(key)),
  save: (key: string, items: Omit<MenuItemNode, "id">[]) => send<Menu>("put", E.UPDATE(key), { items }),
};
