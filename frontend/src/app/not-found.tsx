import type { Metadata } from "next";

import "./(website)/website.css";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

import { NotFoundLogger } from "./(website)/_components/NotFoundLogger";

import { WEBSITE_ROUTES } from "@/config/routes";
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="site-theme bg-page flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <NotFoundLogger />
      <p className="text-primary text-sm font-semibold">404 error</p>
      <h1 className="text-fg mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Page not found</h1>
      <p className="text-fg-subtle mt-4 max-w-md text-base">
        Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have moved or no longer exists.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="bg-primary hover:bg-primary-hover inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-xs"
        >
          <Home className="h-4 w-4" /> Back to home
        </Link>
        <Link
          href={WEBSITE_ROUTES.CONTACT()}
          className="border-line bg-surface text-fg-muted hover:bg-page inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" /> Contact us
        </Link>
      </div>
    </div>
  );
}
