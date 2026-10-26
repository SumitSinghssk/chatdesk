import type { Metadata } from "next";

import "@/app/admin/admin.css";
import "../(workspace)/customer.css";

import { DocsShell } from "./_components/DocsShell";

export const metadata: Metadata = {
  title: { default: "Developer docs", template: "%s | ChatDesk Docs" },
  description: "Connect ChatDesk to your website, app, CRM, Zapier or Make with the API and webhooks.",
};

// Same design tokens and brand colour as the workspace (admin-theme + customer-theme), so the docs
// look like part of ChatDesk in light and dark mode.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-theme customer-theme min-h-screen">
      <DocsShell>{children}</DocsShell>
    </div>
  );
}
