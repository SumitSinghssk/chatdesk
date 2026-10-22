"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleUserRound, LogIn } from "lucide-react";

import { CUSTOMER_HINT_COOKIE, CUSTOMER_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

const subscribe = (notify: () => void) => {
  window.addEventListener("focus", notify);
  window.addEventListener("sk-member-change", notify);
  return () => {
    window.removeEventListener("focus", notify);
    window.removeEventListener("sk-member-change", notify);
  };
};

const signedIn = () => document.cookie.split("; ").some((c) => c === `${CUSTOMER_HINT_COOKIE}=1`);

export function notifyMemberChange() {
  window.dispatchEvent(new Event("sk-member-change"));
}

export function AccountLink({ className }: { className?: string }) {
  const member = useSyncExternalStore(subscribe, signedIn, () => false);
  const Icon = member ? CircleUserRound : LogIn;
  const label = member ? "Dashboard" : "Sign in";

  return (
    <Link
      href={member ? CUSTOMER_ROUTES.DASHBOARD() : CUSTOMER_ROUTES.LOGIN()}
      className={cn(
        "text-fg-muted hover:bg-hover hover:text-fg inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
        className
      )}
      aria-label={label}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
