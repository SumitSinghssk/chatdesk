import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { getSiteName } from "@/app/admin/_lib/siteName";

import { ADMIN_ROUTES } from "@/config/routes";
export async function AuthLayout({
  title,
  subtitle,
  children,
  backToLogin = false,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  backToLogin?: boolean;
}) {
  const siteName = await getSiteName();
  return (
    <div className="admin-theme bg-page flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="bg-primary flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm">
            {siteName.charAt(0).toUpperCase()}
          </span>
          <h1 className="text-fg mt-5 text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-fg-subtle mt-1 text-sm">{subtitle}</p>}
        </div>

        <div className="border-line bg-surface rounded-2xl border p-6 shadow-sm sm:p-7">{children}</div>

        <div className="text-fg-faint mt-6 flex items-center justify-between text-xs">
          <span>
            © {new Date().getFullYear()} {siteName}
          </span>
          {backToLogin && (
            <Link
              href={ADMIN_ROUTES.LOGIN()}
              className="hover:text-fg-muted inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
