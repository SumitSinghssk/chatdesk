"use client";

import { create } from "zustand";

import type { AuthUser } from "@/app/admin/_lib/api/authApi";
import { clearQueryCache } from "@/app/admin/_lib/queryClient";
import { setDisplayTimeZone } from "@/lib/utils";

const LEGACY_KEYS = ["sk_admin_user", "sk_admin_access", "sk_admin_refresh", "sk_admin_2fa"];

interface PendingTwoFactor {
  token: string;
  remember: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  hydrated: boolean;
  pendingTwoFactor: PendingTwoFactor | null;
  setSession: (data: { user: AuthUser; access_token: string }) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: AuthUser) => void;
  setPendingTwoFactor: (pending: PendingTwoFactor | null) => void;
  markSignedOut: () => void;
  clear: () => void;
}

if (typeof window !== "undefined") {
  try {
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {}
}

const channel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("sk-admin-auth")
    : null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  hydrated: false,
  pendingTwoFactor: null,

  setSession: ({ user, access_token }) => {
    clearQueryCache();
    setDisplayTimeZone(user.site?.timezone);
    set({ user, accessToken: access_token, hydrated: true });
    channel?.postMessage({ type: "login" });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  setUser: (user) =>
    set((state) => {
      const site = user.site ?? state.user?.site;
      setDisplayTimeZone(site?.timezone);
      return { user: { ...user, site } };
    }),

  setPendingTwoFactor: (pendingTwoFactor) => set({ pendingTwoFactor }),

  markSignedOut: () => set({ user: null, accessToken: null, hydrated: true }),

  clear: () => {
    clearQueryCache();
    set({ user: null, accessToken: null, hydrated: true, pendingTwoFactor: null });
    channel?.postMessage({ type: "logout" });
  },
}));

channel?.addEventListener("message", (event: MessageEvent<{ type: string }>) => {
  if (event.data?.type === "logout") {
    clearQueryCache();
    useAuthStore.setState({ user: null, accessToken: null, hydrated: true });
  }
  if (event.data?.type === "login") {
    clearQueryCache();
    useAuthStore.setState({ user: null, accessToken: null, hydrated: false });
  }
});
