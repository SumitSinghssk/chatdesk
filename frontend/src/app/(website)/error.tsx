"use client";

import Link from "next/link";
import { Home, RotateCcw } from "lucide-react";

export default function WebsiteError({
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-primary text-sm font-semibold">Something went wrong</p>
      <h1 className="text-fg mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        We couldn&apos;t load this page
      </h1>
      <p className="text-fg-subtle mt-4 max-w-md text-base">
        This is usually temporary. Please try again in a moment.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => (retry ?? reset)()}
          className="bg-primary hover:bg-primary-hover inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-xs"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link
          href="/"
          className="border-line bg-surface text-fg-muted hover:bg-page inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-xs"
        >
          <Home className="h-4 w-4" /> Back to home
        </Link>
      </div>
    </div>
  );
}
