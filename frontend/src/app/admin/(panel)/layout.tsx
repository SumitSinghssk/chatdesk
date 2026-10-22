import { Suspense } from "react";

import { Spinner } from "../_components/ui";
import { AdminShell } from "./_components/AdminShell";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Spinner className="bg-canvas min-h-screen" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
