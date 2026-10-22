import type { Metadata } from "next";

import "@/app/admin/admin.css";
import "./customer.css";

import { Providers } from "@/app/admin/_components/Providers";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Workspace" },
  robots: { index: false, follow: false },
};

// The customer workspace is built exactly like the admin panel: same UI kit, providers and portal.
// Only the brand colour differs (customer.css). Dark mode is applied by CustomerShell, because
// customers usually arrive here by client-side navigation from /login, where an inline script would not run.
export default function WorkspaceRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-theme customer-theme min-h-screen">
      <Providers>{children}</Providers>
      <div id="admin-portal" className="customer-theme relative z-120" />
    </div>
  );
}
