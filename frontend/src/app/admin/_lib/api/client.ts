"use client";

import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "@/app/admin/_store/authStore";
import type { AuthUser } from "@/app/admin/_lib/api/authApi";

import { ADMIN_ENDPOINTS } from "@/config/endpoints/admin";

import { ADMIN_ROUTES } from "@/config/routes";
export const ADMIN_API_BASE = (process.env.NEXT_PUBLIC_ADMIN_API_BASE || "/api/v1").replace(/\/$/, "");
const CSRF_HEADERS = { "X-Requested-With": "sk-admin" };

const api = axios.create({
  baseURL: ADMIN_API_BASE,
  headers: { Accept: "application/json", ...CSRF_HEADERS },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

class SessionExpiredError extends Error {}

function bearer(header: unknown): string | null {
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
}

interface RefreshData {
  access_token: string;
  user?: AuthUser;
}

async function postRefresh(retried = false): Promise<string> {
  try {
    const res = await axios.post<{ data: RefreshData }>(
      `${ADMIN_API_BASE}${ADMIN_ENDPOINTS.AUTH.REFRESH}`,
      null,
      {
        headers: { Accept: "application/json", ...CSRF_HEADERS },
        withCredentials: true,
      }
    );
    const { access_token, user } = res.data.data;
    useAuthStore.getState().setAccessToken(access_token);
    if (user) useAuthStore.getState().setUser(user);
    return access_token;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 409 && !retried) return postRefresh(true);
    if (status === 401 || status === 403 || status === 409) throw new SessionExpiredError("Refresh rejected");
    throw error;
  }
}

function refreshAccessToken(failedAccessToken: string | null): Promise<string> {
  const run = () => {
    const current = useAuthStore.getState().accessToken;
    if (current && failedAccessToken && current !== failedAccessToken) return Promise.resolve(current);
    return postRefresh();
  };
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("sk-admin-token-refresh", run);
  }
  return run();
}

function sharedRefresh(failedAccessToken: string | null): Promise<string> {
  refreshPromise ??= refreshAccessToken(failedAccessToken).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

let restoring: Promise<void> | null = null;

export function restoreSession(): Promise<void> {
  restoring ??= sharedRefresh(null)
    .then(() => {
      useAuthStore.setState({ hydrated: true });
    })
    .catch((error) => {
      if (error instanceof SessionExpiredError) {
        useAuthStore.getState().markSignedOut();
        return;
      }
      return new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)).then(() => {
        restoring = null;
        return restoreSession();
      });
    })
    .finally(() => {
      restoring = null;
    });
  return restoring;
}

function signOut() {
  useAuthStore.getState().clear();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith(ADMIN_ROUTES.LOGIN())) {
    const next = window.location.pathname + window.location.search;
    window.location.href = ADMIN_ROUTES.LOGIN({ next });
  }
}

const NO_REFRESH = [
  ADMIN_ENDPOINTS.AUTH.LOGIN,
  ADMIN_ENDPOINTS.AUTH.REFRESH,
  ADMIN_ENDPOINTS.AUTH.TWO_FACTOR,
  ADMIN_ENDPOINTS.AUTH.LOGOUT,
];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? "";

    if (error.response?.status !== 401 || !original || NO_REFRESH.some((path) => url.includes(path))) {
      return Promise.reject(error);
    }
    if (original._retry) {
      signOut();
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const token = await sharedRefresh(bearer(original.headers.Authorization));
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      if (refreshError instanceof SessionExpiredError) {
        signOut();
        return Promise.reject(error);
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;
