import type { Metadata } from "next";

import "@/app/(website)/website.css";
import { Construction } from "lucide-react";

import { getSettings } from "@/app/(website)/_lib/websiteApi";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Down for maintenance",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const m = (await getSettings())?.maintenance;
  return (
    <div className="site-theme bg-page flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
        <Construction className="h-7 w-7" />
      </span>
      <h1 className="text-fg mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
        {m?.title || "We'll be back soon"}
      </h1>
      <p className="text-fg-subtle mt-4 max-w-lg text-base">
        {m?.message || "We're doing some scheduled maintenance. Please check back shortly."}
      </p>
      {m?.ends_at && (
        <p className="text-fg-faint mt-6 text-sm">Expected back by {formatDateTime(m.ends_at)}</p>
      )}
    </div>
  );
}
