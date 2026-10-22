import type { Metadata } from "next";
import { headers } from "next/headers";

import "./admin.css";

import { Providers } from "./_components/Providers";
import { themeInitScript } from "./_store/themeStore";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="admin-theme min-h-screen">
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <Providers>{children}</Providers>
      <div id="admin-portal" className="relative z-120" />
    </div>
  );
}
