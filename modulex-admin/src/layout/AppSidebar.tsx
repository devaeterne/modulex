"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/supabase/profile";

type SubItem = {
  name: string;
  path: string;
  permission: Permission;
  new?: boolean;
  exact?: boolean;
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  permission?: Permission;
  exact?: boolean;
  subItems?: SubItem[];
};

const navItems: NavItem[] = [
  { icon: <GridIcon />, name: "Dashboard", path: "/", permission: "dashboard.view", exact: true },
  {
    icon: <BoxCubeIcon />,
    name: "Products",
    subItems: [
      { name: "Product List", path: "/products", permission: "products.view", exact: true },
      { name: "Low Stock", path: "/low-stock", permission: "inventory.view" },
      { name: "Brands", path: "/brands", permission: "products.manage" },
      { name: "Categories", path: "/categories", permission: "products.manage" },
    ],
  },
  {
    icon: <DollarLineIcon />,
    name: "Pricing",
    subItems: [
      { name: "Pricing Dashboard", path: "/pricing/dashboard", permission: "pricing.view" },
      { name: "Product Prices", path: "/pricing/products", permission: "pricing.view" },
      { name: "Price Groups", path: "/pricing/groups", permission: "pricing.manage" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Customers",
    subItems: [
      { name: "Dashboard", path: "/customers/dashboard", permission: "customers.view" },
      { name: "Customer List", path: "/customers", permission: "customers.view", exact: true },
      { name: "Orders", path: "/customers/orders", permission: "orders.view" },
      { name: "Shipments", path: "/customers/shipments", permission: "shipments.view" },
      { name: "Installations", path: "/customers/installations", permission: "installations.view" },
    ],
  },
  {
    icon: <TableIcon />,
    name: "Inventory",
    subItems: [
      { name: "Stock Overview", path: "/inventory", permission: "inventory.view" },
      { name: "Stock Movements", path: "/stock-movements", permission: "inventory.view" },
      { name: "Stock Operations", path: "/stock-operations", permission: "inventory.manage" },
    ],
  },
  {
    icon: <ListIcon />,
    name: "Warehouse",
    subItems: [
      { name: "Warehouses", path: "/warehouses", permission: "warehouse.view" },
      { name: "Zones", path: "/zones", permission: "warehouse.view" },
      { name: "Locations", path: "/locations", permission: "warehouse.view" },
    ],
  },
  {
    icon: <PageIcon />,
    name: "QR Operations",
    subItems: [
      { name: "QR Labels", path: "/qr-labels", permission: "qr.view" },
      { name: "Scan QR / Barcode", path: "/scan", permission: "qr.manage" },
      { name: "Shelf Inventory", path: "/shelf-inventory", permission: "qr.manage" },
    ],
  },
];

const managementItems: NavItem[] = [
  {
    icon: <UserCircleIcon />,
    name: "Personnel",
    subItems: [
      { name: "Overview", path: "/personnel", permission: "personnel.view", exact: true },
      { name: "Employees", path: "/personnel/employees", permission: "personnel.view", new: true },
      { name: "Attendance", path: "/personnel/attendance", permission: "personnel.view" },
      { name: "Leave & PTO", path: "/personnel/leave", permission: "personnel.view" },
      { name: "Compensation", path: "/personnel/compensation", permission: "personnel.view" },
      { name: "Payroll", path: "/personnel/payroll", permission: "personnel.view" },
      { name: "Benefits", path: "/personnel/benefits", permission: "personnel.view" },
      { name: "Documents", path: "/personnel/documents", permission: "personnel.view" },
      { name: "Compliance & Emergency", path: "/personnel/compliance", permission: "personnel.view" },
      { name: "Onboarding & Offboarding", path: "/personnel/lifecycle", permission: "personnel.view" },
      { name: "Performance", path: "/personnel/performance", permission: "personnel.view" },
      { name: "HR Reports", path: "/personnel/reports", permission: "personnel.view" },
      { name: "Departments", path: "/personnel/departments", permission: "personnel.manage" },
      { name: "Positions", path: "/personnel/positions", permission: "personnel.manage" },
    ],
  },
  {
    icon: <DollarLineIcon />,
    name: "Finance",
    subItems: [
      { name: "Invoices", path: "/customers/invoices", permission: "invoices.view" },
      { name: "Payroll", path: "/finance/payroll", permission: "finance.view", new: true },
      { name: "Compensation", path: "/finance/compensation", permission: "finance.view" },
      { name: "Approvals", path: "/approvals", permission: "approvals.view", new: true },
      { name: "Cost & Margin", path: "/pricing/cost-margin", permission: "pricing.cost.view" },
      { name: "Tax Rules", path: "/settings/general/tax-rules", permission: "finance.manage" },
      { name: "Payment Methods", path: "/settings/payment-methods", permission: "finance.manage" },
    ],
  },
  {
    icon: <PieChartIcon />,
    name: "Reports",
    subItems: [
      { name: "Inventory Reports", path: "/reports/inventory", permission: "reports.view" },
      { name: "Movement Reports", path: "/reports/movements", permission: "reports.view" },
    ],
  },
  {
    icon: <UserCircleIcon />,
    name: "Users",
    subItems: [
      { name: "User Management", path: "/users", permission: "users.view" },
      { name: "Roles & Access", path: "/roles", permission: "roles.manage" },
    ],
  },
  {
    icon: <PageIcon />,
    name: "Store",
    subItems: [
      { name: "Site Content", path: "/store/content", permission: "store.manage", exact: true },
      { name: "Pages", path: "/store/pages", permission: "store.manage", exact: true },
      { name: "Projects", path: "/store/projects", permission: "store.manage", exact: true },
      { name: "Marketing & Analytics", path: "/store/marketing", permission: "store.manage", exact: true },
      { name: "Product Content", path: "/store/products", permission: "store.view", exact: true },
      { name: "Color Options", path: "/store/colors", permission: "store.manage", exact: true },
      { name: "Leads & Dealer Apps", path: "/store/leads", permission: "leads.view", exact: true },
    ],
  },
  {
    icon: <GridIcon />,
    name: "General Settings",
    subItems: [
      { name: "Overview", path: "/settings/general", permission: "settings.view", exact: true },
      { name: "Company", path: "/settings/general/company", permission: "settings.view" },
      { name: "Localization", path: "/settings/general/localization", permission: "settings.view" },
      { name: "Documents", path: "/settings/general/documents", permission: "settings.view" },
      { name: "Email", path: "/settings/general/email", permission: "settings.view" },
      { name: "Notifications", path: "/settings/general/notifications", permission: "settings.view" },
      { name: "Email Delivery Log", path: "/settings/general/email-notifications", permission: "settings.view" },
    ],
  },
  {
    icon: <PageIcon />,
    name: "System",
    subItems: [
      { name: "API Test", path: "/api-test", permission: "system.view" },
    ],
  },
];

function filterItems(items: NavItem[], role: UserRole): NavItem[] {
  return items.flatMap((item) => {
    if (item.path) {
      return item.permission && hasPermission(role, item.permission) ? [item] : [];
    }

    const subItems = (item.subItems ?? []).filter((subItem) => hasPermission(role, subItem.permission));
    return subItems.length ? [{ ...item, subItems }] : [];
  });
}

export default function AppSidebar({ role }: { role: UserRole }) {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "management"; index: number } | null>(null);

  const visibleNavItems = useMemo(() => filterItems(navItems, role), [role]);
  const visibleManagementItems = useMemo(() => filterItems(managementItems, role), [role]);

  const isActive = useCallback((path: string, exact = false) => {
    if (path === "/" || exact) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  }, [pathname]);

  function toggleSubmenu(index: number, type: "main" | "management") {
    setOpenSubmenu((current) => current?.type === type && current.index === index ? null : { type, index });
  }

  useEffect(() => {
    const groups = [
      { type: "main" as const, items: visibleNavItems },
      { type: "management" as const, items: visibleManagementItems },
    ];

    for (const group of groups) {
      for (let index = 0; index < group.items.length; index += 1) {
        const item = group.items[index];
        if (item.subItems?.some((subItem) => isActive(subItem.path, subItem.exact))) {
          setOpenSubmenu({ type: group.type, index });
          return;
        }
      }
    }
    setOpenSubmenu(null);
  }, [pathname, isActive, visibleNavItems, visibleManagementItems]);

  const renderItems = (items: NavItem[], type: "main" | "management") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => {
        const isOpen = openSubmenu?.type === type && openSubmenu.index === index;
        return (
          <li key={nav.name}>
            {nav.subItems ? (
              <button
                onClick={() => toggleSubmenu(index, type)}
                className={`menu-item group ${isOpen ? "menu-item-active" : "menu-item-inactive"} cursor-pointer ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"}`}
              >
                <span className={isOpen ? "menu-item-icon-active" : "menu-item-icon-inactive"}>{nav.icon}</span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <>
                    <span className="menu-item-text">{nav.name}</span>
                    <ChevronDownIcon className={`ml-auto h-5 w-5 transition-transform duration-200 ${isOpen ? "rotate-180 text-brand-500" : ""}`} />
                  </>
                )}
              </button>
            ) : nav.path ? (
              <Link href={nav.path} className={`menu-item group ${isActive(nav.path, nav.exact) ? "menu-item-active" : "menu-item-inactive"}`}>
                <span className={isActive(nav.path, nav.exact) ? "menu-item-icon-active" : "menu-item-icon-inactive"}>{nav.icon}</span>
                {(isExpanded || isHovered || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
              </Link>
            ) : null}

            {nav.subItems && isOpen && (isExpanded || isHovered || isMobileOpen) && (
              <ul className="ml-9 mt-2 space-y-1">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.path}>
                    <Link href={subItem.path} className={`menu-dropdown-item ${isActive(subItem.path, subItem.exact) ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}>
                      {subItem.name}
                      {subItem.new && <span className="menu-dropdown-badge ml-auto">new</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 ${isExpanded || isMobileOpen || isHovered ? "w-[290px]" : "w-[90px]"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex py-8 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <Image className="dark:hidden" src="/images/logo/logo.svg" alt="Modulex" width={150} height={40} priority />
              <Image className="hidden dark:block" src="/images/logo/logo-dark.svg" alt="Modulex" width={150} height={40} priority />
            </>
          ) : (
            <Image src="/images/logo/logo-icon.svg" alt="Modulex" width={32} height={32} priority />
          )}
        </Link>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {visibleNavItems.length > 0 && (
              <div>
                <h2 className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                  {isExpanded || isHovered || isMobileOpen ? "Operations" : <HorizontaLDots />}
                </h2>
                {renderItems(visibleNavItems, "main")}
              </div>
            )}
            {visibleManagementItems.length > 0 && (
              <div>
                <h2 className={`mb-4 flex text-xs uppercase leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                  {isExpanded || isHovered || isMobileOpen ? "Management" : <HorizontaLDots />}
                </h2>
                {renderItems(visibleManagementItems, "management")}
              </div>
            )}
          </div>
        </nav>
        {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null}
      </div>
    </aside>
  );
}
