"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const customerPortalNav = [
  ["Overview", "/account"],
  ["Orders", "/account/orders"],
  ["Shipments", "/account/shipments"],
  ["Installations", "/account/installations"],
] as const;

export const dealerPortalNav = [
  ["Overview", "/dealer"],
  ["Catalog", "/dealer/catalog"],
  ["Orders", "/dealer/orders"],
  ["Shipments", "/dealer/shipments"],
  ["Installations", "/dealer/installations"],
  ["Documents", "/dealer/documents"],
  ["Account", "/dealer/account"],
] as const;

type PortalNavigationProps = {
  kind: "customer" | "dealer";
};

function isActive(pathname: string, href: string) {
  if (href === "/account" || href === "/dealer") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PortalNavigation({ kind }: PortalNavigationProps) {
  const pathname = usePathname();
  const items = kind === "dealer" ? dealerPortalNav : customerPortalNav;

  return (
    <nav className="portal-nav" aria-label={`${kind === "dealer" ? "Dealer" : "Customer"} portal`}>
      {items.map(([label, href]) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`portal-nav-link${active ? " portal-nav-link--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
