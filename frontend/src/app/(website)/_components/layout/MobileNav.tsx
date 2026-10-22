"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import type { MenuNode } from "@/app/(website)/_lib/websiteApi";
import { cn } from "@/lib/utils";

import { MenuLink, isActivePath } from "./NavLinks";

import { WEBSITE_ROUTES } from "@/config/routes";
export function MobileNav({ items }: { items: MenuNode[] }) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null);

  const render = (nodes: MenuNode[], depth = 0) =>
    nodes.map((item) => (
      <li key={item.id}>
        <MenuLink
          item={item}
          className={cn(
            "block rounded-md px-3 py-2.5 text-base font-medium",
            depth > 0 && "pl-6 text-sm font-normal",
            isActivePath(pathname, item.url) ? "bg-primary-soft text-primary" : "text-fg hover:bg-hover"
          )}
        />
        {item.children.length > 0 && <ul>{render(item.children, depth + 1)}</ul>}
      </li>
    ));

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="text-fg hover:bg-hover flex h-10 w-10 items-center justify-center rounded-lg"
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      {open && (
        <div className="border-line bg-surface absolute inset-x-0 top-16 border-b shadow-lg">
          <ul className="mx-auto max-w-6xl space-y-0.5 p-3">
            {render(items)}
            <li className="pt-2">
              <Link
                href={WEBSITE_ROUTES.CONTACT()}
                className="bg-primary text-primary-fg block rounded-lg px-3 py-2.5 text-center text-base font-semibold"
              >
                Get in touch
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
