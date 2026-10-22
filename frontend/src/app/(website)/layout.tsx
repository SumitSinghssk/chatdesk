import type { Metadata } from "next";

import "./website.css";

import { HtmlSnippets } from "./_components/layout/HtmlSnippets";
import { SiteFooter } from "./_components/layout/SiteFooter";
import { SiteHeader } from "./_components/layout/SiteHeader";
import { SiteTimeZone } from "./_components/layout/SiteTimeZone";
import { getMenu, getSettings } from "./_lib/websiteApi";
import { buildMetadata } from "./_lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/");
}

export default async function WebsiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, header, footer] = await Promise.all([getSettings(), getMenu("header"), getMenu("footer")]);
  const scripts = settings?.scripts;

  return (
    <div className="site-theme bg-surface flex min-h-screen flex-col">
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
