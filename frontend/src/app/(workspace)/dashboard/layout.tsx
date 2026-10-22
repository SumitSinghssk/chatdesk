import { Suspense } from "react";

import { Spinner } from "@/app/admin/_components/ui/index";

import { CustomerShell } from "./_components/CustomerShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Spinner className="bg-canvas min-h-screen" />}>
      <CustomerShell>{children}</CustomerShell>
    </Suspense>
  );
}
