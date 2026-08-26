"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import {
  canRoleSeeNotification,
  type AppNotification,
  type NotificationSeverity,
} from "@/lib/notifications";

type InventoryAlertRow = {
  inventory_id: string;
  sku: string;
  product_name: string;
  warehouse_code: string;
  location_code: string;
  available_quantity: number;
  stock_status: string;
};

function severityStyles(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return {
        icon: "bg-error-50 text-error-600 ring-error-100 dark:bg-error-500/10 dark:text-error-400 dark:ring-error-500/20",
        badge: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
        dot: "bg-error-500",
        label: "Critical",
      };
    case "warning":
      return {
        icon: "bg-warning-50 text-warning-700 ring-warning-100 dark:bg-warning-500/10 dark:text-warning-400 dark:ring-warning-500/20",
        badge: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
        dot: "bg-warning-500",
        label: "Attention",
      };
    case "success":
      return {
        icon: "bg-success-50 text-success-700 ring-success-100 dark:bg-success-500/10 dark:text-success-400 dark:ring-success-500/20",
        badge: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
        dot: "bg-success-500",
        label: "Ready",
      };
    case "dealer":
      return {
        icon: "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20",
        badge: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
        dot: "bg-purple-500",
        label: "Application",
      };
    case "info":
    default:
      return {
        icon: "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20",
        badge: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
        dot: "bg-brand-500",
        label: "New",
      };
  }
}

function notificationIcon(notification: AppNotification) {
  const styles = severityStyles(notification.severity);
  const baseClass = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ring-1 ${styles.icon}`;

  switch (notification.type) {
    case "low_stock":
      return <span className={baseClass}>STK</span>;
    case "new_order_request":
      return <span className={baseClass}>ORD</span>;
    case "new_dealer_application":
      return <span className={baseClass}>DLR</span>;
    case "order_ready_for_shipment":
      return <span className={baseClass}>SHP</span>;
    case "order_cancellation":
      return <span className={baseClass}>CAN</span>;
    case "stock_warehouse_problem":
      return <span className={baseClass}>WH</span>;
    default:
      return <span className={baseClass}>!</span>;
  }
}

function readStorageKey(userId: string) {
  return `modulex-notifications-read:${userId}`;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadNotifications() {
      setIsLoading(true);

      const { profile } = await getCurrentProfile();

      if (!mounted || !profile) {
        if (mounted) setIsLoading(false);
        return;
      }

      setRole(profile.role);
      setUserId(profile.id);

      try {
        const storedReadIds = window.localStorage.getItem(readStorageKey(profile.id));
        if (storedReadIds) {
          setReadIds(new Set(JSON.parse(storedReadIds) as string[]));
        }
      } catch {
        setReadIds(new Set());
      }

      const nextNotifications: AppNotification[] = [];

      if (canRoleSeeNotification(profile.role, "low_stock")) {
        const { data } = await supabase.rpc("search_stock", {
          p_query: "",
          p_limit: 100,
        });

        const lowStockRows = ((data as InventoryAlertRow[] | null) ?? [])
          .filter((row) => row.stock_status === "LOW_STOCK")
          .sort(
            (a, b) =>
              Number(a.available_quantity ?? 0) - Number(b.available_quantity ?? 0)
          )
          .slice(0, 8);

        for (const row of lowStockRows) {
          const available = Number(row.available_quantity ?? 0);
          const critical = available <= 1;

          nextNotifications.push({
            id: `low-stock:${row.inventory_id}:${available}`,
            type: "low_stock",
            title: critical ? "Critical stock level" : "Low stock detected",
            description: `${row.sku} · ${row.product_name} has ${available.toLocaleString(
              "en-US"
            )} available at ${row.warehouse_code} / ${row.location_code}.`,
            severity: critical ? "critical" : "warning",
            href: "/inventory",
            timeLabel: "Current stock",
          });
        }
      }

      if (!mounted) return;

      setNotifications(nextNotifications);
      setIsLoading(false);
    }

    void loadNotifications();

    return () => {
      mounted = false;
    };
  }, []);

  const visibleNotifications = useMemo(() => {
    if (!role) return [];

    return notifications.filter((notification) =>
      canRoleSeeNotification(role, notification.type)
    );
  }, [notifications, role]);

  const unreadCount = useMemo(
    () => visibleNotifications.filter((notification) => !readIds.has(notification.id)).length,
    [visibleNotifications, readIds]
  );

  function persistReadIds(nextReadIds: Set<string>) {
    setReadIds(nextReadIds);

    if (!userId) return;

    try {
      window.localStorage.setItem(
        readStorageKey(userId),
        JSON.stringify(Array.from(nextReadIds))
      );
    } catch {
      // Notification read state is non-critical; keep the in-memory state.
    }
  }

  function markAsRead(notificationId: string) {
    if (readIds.has(notificationId)) return;

    const nextReadIds = new Set(readIds);
    nextReadIds.add(notificationId);
    persistReadIds(nextReadIds);
  }

  function markAllAsRead() {
    const nextReadIds = new Set(readIds);

    for (const notification of visibleNotifications) {
      nextReadIds.add(notification.id);
    }

    persistReadIds(nextReadIds);
  }

  function toggleDropdown() {
    setIsOpen((current) => !current);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="dropdown-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={toggleDropdown}
        aria-label={`Open notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
      >
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white dark:ring-gray-900">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}

        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex w-[360px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[400px] lg:right-0"
      >
        <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h5 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Notifications
                </h5>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-600 dark:bg-error-500/10 dark:text-error-400">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Actionable updates for your assigned role
              </p>
            </div>

            <button
              type="button"
              onClick={closeDropdown}
              className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300"
              aria-label="Close notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6L18 18M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="mt-3 text-xs font-medium text-brand-500 transition hover:text-brand-600 dark:text-brand-400"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="max-h-[430px] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex min-h-[180px] items-center justify-center px-5 py-8">
              <div className="text-center">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Loading notifications...
                </p>
              </div>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center px-6 py-8 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400">
                ✓
              </span>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                You&apos;re all caught up
              </p>
              <p className="mt-1 max-w-[260px] text-xs leading-5 text-gray-500 dark:text-gray-400">
                New stock, order, dealer and warehouse alerts relevant to your role will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {visibleNotifications.map((notification) => {
                const unread = !readIds.has(notification.id);
                const styles = severityStyles(notification.severity);

                return (
                  <li key={notification.id}>
                    <DropdownItem
                      tag="a"
                      href={notification.href ?? "/"}
                      onClick={() => markAsRead(notification.id)}
                      onItemClick={closeDropdown}
                      baseClassName="block w-full text-left"
                      className={`relative flex gap-3 px-4 py-4 transition hover:bg-gray-50 dark:hover:bg-white/[0.03] ${
                        unread ? "bg-brand-50/30 dark:bg-brand-500/[0.03]" : ""
                      }`}
                    >
                      {unread && (
                        <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-500" />
                      )}

                      {notificationIcon(notification)}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                            {notification.title}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.badge}`}>
                            {styles.label}
                          </span>
                        </span>

                        <span className="mt-1.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {notification.description}
                        </span>

                        <span className="mt-2 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                          <span>{notification.timeLabel}</span>
                        </span>
                      </span>
                    </DropdownItem>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-100 p-3 dark:border-gray-800">
          <Link
            href="/inventory"
            onClick={closeDropdown}
            className="block rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-center text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            View inventory
          </Link>
        </div>
      </Dropdown>
    </div>
  );
}
