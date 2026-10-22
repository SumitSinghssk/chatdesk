import api from "./client";
import type { ApiResponse, BulkAction, ListParams, Paginated, PaginationMeta } from "./types";

export function cleanParams(params: ListParams = {}): ListParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "all")
  );
}

export async function getPage<T>(
  url: string,
  params: ListParams,
  signal?: AbortSignal
): Promise<Paginated<T>> {
  const res = await api.get<ApiResponse<T[]> & { meta: PaginationMeta }>(url, {
    params: cleanParams({ page: 1, ...params }),
    signal,
  });
  return { items: res.data.data, meta: res.data.meta };
}

export async function getList<T>(url: string, params: ListParams = {}): Promise<T[]> {
  const res = await api.get<ApiResponse<T[]>>(url, { params: cleanParams(params) });
  return res.data.data;
}

export async function getOne<T>(url: string): Promise<T> {
  const res = await api.get<ApiResponse<T>>(url);
  return res.data.data;
}

export async function send<T>(method: "post" | "put" | "patch" | "delete", url: string, body?: unknown) {
  const res = await api.request<ApiResponse<T>>({ method, url, data: body });
  return res.data;
}

export function createCrudApi<T, P = Partial<T>>(endpoints: {
  LIST: string;
  CREATE: string;
  SHOW: (id: number) => string;
  UPDATE: (id: number) => string;
  DELETE: (id: number) => string;
  TOGGLE?: (id: number) => string;
  BULK?: string;
}) {
  return {
    page: (params: ListParams, signal?: AbortSignal) => getPage<T>(endpoints.LIST, params, signal),
    all: (params: ListParams = {}) => getList<T>(endpoints.LIST, params),
    get: (id: number) => getOne<T>(endpoints.SHOW(id)),
    create: (payload: P) => send<T>("post", endpoints.CREATE, payload),
    update: (id: number, payload: P) => send<T>("put", endpoints.UPDATE(id), payload),
    remove: (id: number) => send<null>("delete", endpoints.DELETE(id)),
    toggle: (id: number) => send<T>("patch", endpoints.TOGGLE!(id)),
    bulk: (ids: number[], action: BulkAction) => send<null>("post", endpoints.BULK!, { ids, action }),
  };
}
