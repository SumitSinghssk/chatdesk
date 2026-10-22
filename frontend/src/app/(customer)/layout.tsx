import type { Metadata } from "next";

import "@/app/(website)/website.css";

import { HtmlSnippets } from "@/app/(website)/_components/layout/HtmlSnippets";
import { SiteFooter } from "@/app/(website)/_components/layout/SiteFooter";
import { SiteHeader } from "@/app/(website)/_components/layout/SiteHeader";
import { SiteTimeZone } from "@/app/(website)/_components/layout/SiteTimeZone";
import { getMenu, getSettings } from "@/app/(website)/_lib/websiteApi";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [settings, header, footer] = await Promise.all([getSettings(), getMenu("header"), getMenu("footer")]);
  const scripts = settings?.scripts;

  return (
    <div className="site-theme bg-page flex min-h-screen flex-col">
      {scripts?.custom_css && <style dangerouslySetInnerHTML={{ __html: scripts.custom_css }} />}
      <a
        href="#content"
        className="focus:bg-primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteTimeZone timeZone={settings?.date_time?.timezone} />
      <SiteHeader menu={header} settings={settings} />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter menu={footer} settings={settings} />
      <HtmlSnippets html={scripts?.header_scripts} target="head" />
      <HtmlSnippets html={scripts?.footer_scripts} target="body" />
    </div>
  );
}
