"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  TableIcon,
  UserCircleIcon,
  DollarLineIcon,
} from "../icons/index";
import SidebarWidget from "./SidebarWidget";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; new?: boolean }[];
};

const navItems: NavItem[] = [
  { icon: <GridIcon />, name: "Dashboard", path: "/" },
  {
    icon: <BoxCubeIcon />,
    name: "Products",
    subItems: [
      { name: "Product List", path: "/products" },
      { name: "Low Stock", path: "/low-stock" },
      { name: "Brands", path: "/brands" },
      { name: "Categories", path: "/categories" },
    ],
  },
  {
    icon: <DollarLineIcon />,
    name: "Pricing",
    subItems: [
      { name: "Pricing Dashboard", path: "/pricing/dashboard" },
      { name: "Product Prices", path: "/pricing/products" },
      { name: "Price Groups", path: "/pricing/groups" },
      { name: "Cost & Margin", path: "/pricing/cost-margin" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Customers",
    subItems: [
      { name: "Dashboard", path: "/customers/dashboard" },
      { name: "Customer List", path: "/customers" },
      { name: "Orders", path: "/customers/orders" },
      { name: "Invoices", path: "/customers/invoices" },
      { name: "Shipments", path: "/customers/shipments" },
      { name: "Installations", path: "/customers/installations" },
    ],
  },
  {
    icon: <TableIcon />,
    name: "Inventory",
    subItems: [
      { name: "Stock Overview", path: "/inventory" },
      { name: "Stock Movements", path: "/stock-movements" },
      { name: "Stock Operations", path: "/stock-operations" },
    ],
  },
  {
    icon: <ListIcon />,
    name: "Warehouse",
    subItems: [
      { name: "Warehouses", path: "/warehouses" },
      { name: "Zones", path: "/zones" },
      { name: "Locations", path: "/locations" },
    ],
  },
  {
    icon: <PageIcon />,
    name: "QR Operations",
    subItems: [
      { name: "QR Labels", path: "/qr-labels" },
      { name: "Scan QR / Barcode", path: "/scan" },
      { name: "Shelf Inventory", path: "/shelf-inventory" },
    ],
  },
];

const managementItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "Reports",
    subItems: [
      { name: "Inventory Reports", path: "/reports/inventory" },
      { name: "Movement Reports", path: "/reports/movements" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Users",
    subItems: [
      { name: "User Management", path: "/users" },
      { name: "Roles & Access", path: "/roles" },
    ],
  },
  {
    icon: <GridIcon />,
    name: "General Settings",
    subItems: [
      { name: "Overview", path: "/settings/general" },
      { name: "Company", path: "/settings/general/company" },
      { name: "Localization", path: "/settings/general/localization" },
      { name: "Documents", path: "/settings/general/documents" },
      { name: "Email", path: "/settings/general/email" },
      { name: "Notifications", path: "/settings/general/notifications" },
      { name: "Email Delivery Log", path: "/settings/general/email-notifications" },
      { name: "Payment Methods", path: "/settings/payment-methods" },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "management"; index: number } | null>(null);

  const isActive = useCallback((path: string) => {
    if (path === "/") return pathname === "/";
    if (path === "/settings/general") return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  }, [pathname]);

  function toggleSubmenu(index: number, type: "main" | "management") {
    setOpenSubmenu((current) => current?.type === type && current.index === index ? null : { type, index });
  }

  useEffect(() => {
    const groups = [
      { type: "main" as const, items: navItems },
      { type: "management" as const, items: managementItems },
    ];
    for (const group of groups) {
      for (let index = 0; index < group.items.length; index += 1) {
        const item = group.items[index];
        if (item.subItems?.some((subItem) => isActive(subItem.path))) {
          setOpenSubmenu({ type: group.type, index });
          return;
        }
      }
    }
    setOpenSubmenu(null);
  }, [pathname, isActive]);

  const renderItems = (items: NavItem[], type: "main" | "management") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => {
        const isOpen = openSubmenu?.type === type && openSubmenu.index === index;
        return <li key={nav.name}>
          {nav.subItems ? <button onClick={() => toggleSubmenu(index, type)} className={`menu-item group ${isOpen ? "menu-item-active" : "menu-item-inactive"} cursor-pointer ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}>
            <span className={isOpen ? "menu-item-icon-active" : "menu-item-icon-inactive"}>{nav.icon}</span>
            {(isExpanded || isHovered || isMobileOpen) && <><span className="menu-item-text">{nav.name}</span><ChevronDownIcon className={`ml-auto h-5 w-5 transition-transform duration-200 ${isOpen ? "rotate-180 text-brand-500" : ""}`} /></>}
          </button> : nav.path ? <Link href={nav.path} className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"}`}><span className={isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"}>{nav.icon}</span>{(isExpanded || isHovered || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}</Link> : null}

          {nav.subItems && isOpen && (isExpanded || isHovered || isMobileOpen) && <ul className="ml-9 mt-2 space-y-1">
            {nav.subItems.map((subItem) => <li key={subItem.path}><Link href={subItem.path} className={`menu-dropdown-item ${isActive(subItem.path) ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}>{subItem.name}{subItem.new && <span className="menu-dropdown-badge ml-auto">new</span>}</Link></li>)}
          </ul>}
        </li>;
      })}
    </ul>
  );

  return <aside className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 ${isExpanded || isMobileOpen || isHovered ? "w-[290px]" : "w-[90px]"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`} onMouseEnter={() => !isExpanded && setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
    <div className={`flex py-8 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}><Link href="/">{isExpanded || isHovered || isMobileOpen ? <><Image className="dark:hidden" src="/images/logo/logo.svg" alt="Modulex" width={150} height={40} priority /><Image className="hidden dark:block" src="/images/logo/logo-dark.svg" alt="Modulex" width={150} height={40} priority /></> : <Image src="/images/logo/logo-icon.svg" alt="Modulex" width={32} height={32} priority />}</Link></div>

    <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
      <nav className="mb-6"><div className="flex flex-col gap-4">
        <div><h2 className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>{isExpanded || isHovered || isMobileOpen ? "Operations" : <HorizontaLDots />}</h2>{renderItems(navItems, "main")}</div>
        <div><h2 className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>{isExpanded || isHovered || isMobileOpen ? "Management" : <HorizontaLDots />}</h2>{renderItems(managementItems, "management")}</div>
      </div></nav>
      {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null}
    </div>
  </aside>;
};

export default AppSidebar;
