"use client";

import { useAuthStore } from "@/app/admin/_store/authStore";
import { siteConfig } from "@/config/site";

export function useSiteName(): string {
  return useAuthStore((state) => state.user?.site?.name) || siteConfig.name;
}
