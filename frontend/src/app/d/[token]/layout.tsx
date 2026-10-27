import type { Metadata } from "next";

import "@/app/admin/admin.css";
import "../../(workspace)/customer.css";

import { Providers } from "@/app/admin/_components/Providers";

export const metadata: Metadata = {
  title: { default: "Shared diagram", template: "%s · Shared diagram" },
  robots: { index: false, follow: false },
};

// A diagram shared by link: the workspace's look (admin-theme + customer-theme), no sign-in.
export default function SharedDiagramLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-theme customer-theme min-h-screen">
      <Providers>{children}</Providers>
      <div id="admin-portal" className="customer-theme relative z-120" />
    </div>
  );
}
