import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import type { MenuNode, SiteSettings } from "@/app/(website)/_lib/websiteApi";
import { siteConfig } from "@/config/site";
import { titleCase } from "@/lib/utils";

import { MenuLink } from "./NavLinks";

export function SiteFooter({ menu, settings }: { menu: MenuNode[]; settings: SiteSettings | null }) {
  const general = settings?.general;
  const name = general?.app_name ?? siteConfig.name;

  return (
    <footer className="border-line bg-surface border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Link href="/" className="text-fg text-lg font-bold">
            {name}
          </Link>
          {general?.tagline && <p className="text-fg-subtle mt-2 max-w-sm text-sm">{general.tagline}</p>}
          {!!general?.social_links.length && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {general.social_links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-line text-fg-muted hover:border-primary hover:text-primary inline-flex rounded-full border px-3 py-1 text-xs"
                  >
                    {titleCase(link.platform)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {menu.length > 0 && (
          <nav aria-label="Footer">
            <p className="text-fg-subtle text-xs font-bold tracking-wider uppercase">Quick links</p>
            <ul className="mt-3 space-y-2">
              {menu.map((item) => (
                <li key={item.id}>
                  <MenuLink item={item} className="text-fg-muted hover:text-primary text-sm" />
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div>
          <p className="text-fg-subtle text-xs font-bold tracking-wider uppercase">Contact</p>
          <ul className="text-fg-muted mt-3 space-y-2.5 text-sm">
            {general?.addresses.map((a, i) => (
              <li key={i} className="flex gap-2">
                <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
                <span>{a.text}</span>
              </li>
            ))}
            {general?.phones.map((p) => (
              <li key={p}>
                <a
                  href={`tel:${p.replace(/\s/g, "")}`}
                  className="hover:text-primary flex items-center gap-2"
                >
                  <Phone size={16} className="text-primary" /> {p}
                </a>
              </li>
            ))}
            {general?.emails.map((e) => (
              <li key={e}>
                <a href={`mailto:${e}`} className="hover:text-primary flex items-center gap-2">
                  <Mail size={16} className="text-primary" /> {e}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-line border-t">
        <p className="text-fg-subtle mx-auto max-w-6xl px-4 py-5 text-xs sm:px-6">
          © {new Date().getFullYear()} {name}. {general?.footer_text}
        </p>
      </div>
    </footer>
  );
}
