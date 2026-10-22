import Link from "next/link";

import { AccountLink } from "@/app/(customer)/_components/AccountLink";
import { siteConfig } from "@/config/site";
import type { MenuNode, SiteSettings } from "@/app/(website)/_lib/websiteApi";

import { MobileNav } from "./MobileNav";
import { NavLinks } from "./NavLinks";

export function SiteHeader({ menu, settings }: { menu: MenuNode[]; settings: SiteSettings | null }) {
  const name = settings?.general.app_name ?? siteConfig.name;
  const logo = settings?.general.logo_light;

  return (
    <header className="border-line bg-surface/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${name} home`}>
          {logo ? (
            <img src={logo} alt={name} className="h-9 w-auto" />
          ) : (
            <>
              <span className="bg-primary flex h-9 w-9 items-center justify-center rounded-lg text-base font-bold text-white shadow-sm">
                {name.charAt(0)}
              </span>
              <span className="text-fg text-base font-bold">{name}</span>
            </>
          )}
        </Link>
        <div className="flex items-center gap-1 md:gap-4">
          <NavLinks items={menu} />
          <AccountLink />
          <MobileNav items={menu} />
        </div>
      </div>
    </header>
  );
}
