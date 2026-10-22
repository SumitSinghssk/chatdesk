"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { BROWSER_API_BASE_URL } from "@/config/site";
import { WEBSITE_ENDPOINTS } from "@/config/endpoints/website";

import { ADMIN_ROUTES } from "@/config/routes";
export function NotFoundLogger() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith(ADMIN_ROUTES.ROOT())) return;
    fetch(`${BROWSER_API_BASE_URL}${WEBSITE_ENDPOINTS.NOT_FOUND}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
