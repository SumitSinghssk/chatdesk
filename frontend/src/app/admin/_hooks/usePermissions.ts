"use client";

import { hasPermission } from "@/config/permissions";
import { useAuthStore } from "@/app/admin/_store/authStore";

export function useCan(key?: string | string[]): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return hasPermission(permissions, key);
}

export function usePermissions() {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (key?: string | string[]) => hasPermission(permissions, key);
}
