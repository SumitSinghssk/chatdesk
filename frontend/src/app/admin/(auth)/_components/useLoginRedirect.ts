"use client";

import { useRouter, useSearchParams } from "next/navigation";

import type { AuthTokens } from "@/app/admin/_lib/api/authApi";
import { useAuthStore } from "@/app/admin/_store/authStore";

import { ADMIN_ROUTES } from "@/config/routes";
function safeNext(next: string | null): string {
  return next && next.startsWith(`${ADMIN_ROUTES.ROOT.path}/`) && !next.startsWith("//")
    ? next
    : ADMIN_ROUTES.DASHBOARD();
}

export function useCompleteLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  return (tokens: AuthTokens) => {
    setSession(tokens);
    const target =
      tokens.user.two_factor_required && !tokens.user.two_factor_enabled
        ? ADMIN_ROUTES.PROFILE({ tab: "security" })
        : safeNext(searchParams.get("next"));
    router.replace(target);
  };
}
