import type { Metadata } from "next";

import "@/app/admin/admin.css";
import "../../../(workspace)/customer.css";

import { Providers } from "@/app/admin/_components/Providers";

export const metadata: Metadata = {
  title: { default: "Diagram", template: "%s" },
  robots: { index: false, follow: false },
};

// A diagram shown on another website, in a frame: view only, no sign-in.
export default function EmbeddedDiagramLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-theme customer-theme h-dvh">
      <Providers>{children}</Providers>
    </div>
  );
}
