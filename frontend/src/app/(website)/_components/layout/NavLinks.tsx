"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import type { MenuNode } from "@/app/(website)/_lib/websiteApi";
import { cn } from "@/lib/utils";

import { WEBSITE_ROUTES } from "@/config/routes";
export function isActivePath(pathname: string, url: string) {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function MenuLink({
  item,
  className,
  onClick,
}: {
  item: MenuNode;
  className?: string;
  onClick?: () => void;
}) {
  const external = /^https?:\/\//.test(item.url);
  const props = item.new_tab ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return external ? (
    <a href={item.url} className={className} onClick={onClick} {...props}>
      {item.label}
    </a>
  ) : (
    <Link href={item.url} className={className} onClick={onClick} {...props}>
      {item.label}
    </Link>
  );
}

export function NavLinks({ items }: { items: MenuNode[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active = isActivePath(pathname, item.url);
        const base = cn(
          "rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active ? "text-primary" : "text-fg-muted hover:text-fg"
        );
        if (!item.children.length) return <MenuLink key={item.id} item={item} className={base} />;
        return (
          <div key={item.id} className="group relative">
            <button type="button" className={cn(base, "flex items-center gap-1")} aria-haspopup="true">
              {item.label}
              <ChevronDown size={14} className="transition-transform group-hover:rotate-180" />
            </button>
            <div className="border-line bg-surface invisible absolute top-full left-0 z-50 min-w-52 translate-y-1 rounded-lg border p-1.5 opacity-0 shadow-xl transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {[item, ...item.children.flatMap((c) => [c, ...c.children])].map((child) =>
                child.id === item.id && item.url === "#" ? null : (
                  <MenuLink
                    key={child.id}
                    item={child}
                    className="text-fg hover:bg-hover block rounded-md px-3 py-2 text-sm"
                  />
                )
              )}
            </div>
          </div>
        );
      })}
      <Link
        href={WEBSITE_ROUTES.CONTACT()}
        className="bg-primary text-primary-fg hover:bg-primary-hover ml-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-xs"
      >
        Get in touch
      </Link>
    </nav>
  );
}
