"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import { canAccessPath } from "@/lib/auth/permissions";

type DashboardKpis = {
  total_products: number;
  active_products: number;
  total_warehouses: number;
  total_locations: number;
  empty_locations: number;
  low_stock_products: number;
  total_stock_quantity: number;
  total_reserved_quantity: number;
  total_available_quantity: number;
  total_inventory_value: number;
  total_movements: number;
};

type RecentMovement = {
  movement_id: string;
  reference_no: string | null;
  sku: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  from_location_code: string | null;
  to_location_code: string | null;
  created_by_email: string | null;
  created_at: string;
};

type DashboardLoadResult = {
  kpis: DashboardKpis;
  recentMovements: RecentMovement[];
};

const emptyKpis: DashboardKpis = {
  total_products: 0,
  active_products: 0,
  total_warehouses: 0,
  total_locations: 0,
  empty_locations: 0,
  low_stock_products: 0,
  total_stock_quantity: 0,
  total_reserved_quantity: 0,
  total_available_quantity: 0,
  total_inventory_value: 0,
  total_movements: 0,
};

const quickActions = [
  { href: "/qr-labels", label: "Print QR Labels" },
  { href: "/scan", label: "Scan QR / Barcode" },
  { href: "/inventory", label: "View Stock Overview" },
  { href: "/low-stock", label: "Check Low Stock" },
] as const;

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

let dashboardLoadPromise: Promise<DashboardLoadResult> | null = null;

function formatNumber(value: number | string | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

function formatDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatMovementType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function fetchDashboardData(): Promise<DashboardLoadResult> {
  if (dashboardLoadPromise) {
    return dashboardLoadPromise;
  }

  const request = (async () => {
    const [
      { data: kpiData, error: kpiError },
      { data: movementsData, error: movementsError },
    ] = await Promise.all([
      supabase.rpc("get_dashboard_kpis"),
      supabase.rpc("get_recent_inventory_movements", {
        p_limit: 5,
      }),
    ]);

    if (kpiError) {
      throw kpiError;
    }

    if (movementsError) {
      throw movementsError;
    }

    return {
      kpis: (kpiData?.[0] as DashboardKpis) ?? emptyKpis,
      recentMovements: (movementsData as RecentMovement[]) ?? [],
    };
  })();

  dashboardLoadPromise = request;

  try {
    return await request;
  } finally {
    if (dashboardLoadPromise === request) {
      dashboardLoadPromise = null;
    }
  }
}

export default function ModulexDashboard() {
  const [kpis, setKpis] = useState<DashboardKpis>(emptyKpis);
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [profileResolved, setProfileResolved] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let mounted = true;

    void getCurrentProfile()
      .then(({ profile }) => {
        if (!mounted) return;
        setActiveRole(profile?.role ?? null);
        setProfileResolved(true);
      })
      .catch(() => {
        if (!mounted) return;
        setActiveRole(null);
        setProfileResolved(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await fetchDashboardData();

        if (!mounted) {
          return;
        }

        setKpis(result.kpis);
        setRecentMovements(result.recentMovements);
      } catch (error) {
        if (!mounted) {
          return;
        }

        console.error("Dashboard load failed:", error);
        setErrorMessage("Dashboard data is temporarily unavailable. Please try again.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, [retryToken]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        <h2 className="text-lg font-semibold">Dashboard could not be loaded</h2>
        <p className="mt-2 text-sm">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setRetryToken((current) => current + 1)}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-error-600 px-4 text-sm font-medium text-white transition hover:bg-error-700 focus:outline-hidden focus:ring-3 focus:ring-error-500/20 dark:bg-error-500 dark:hover:bg-error-600"
        >
          Try again
        </button>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Products",
      value: kpis.total_products,
      helper: `${formatNumber(kpis.active_products)} active products`,
    },
    {
      label: "Total Stock",
      value: kpis.total_stock_quantity,
      helper: `${formatNumber(kpis.total_available_quantity)} available`,
    },
    {
      label: "Reserved Stock",
      value: kpis.total_reserved_quantity,
      helper: "Reserved for operations",
    },
    {
      label: "Low Stock",
      value: kpis.low_stock_products,
      helper: "Products below threshold",
    },
    {
      label: "Warehouses",
      value: kpis.total_warehouses,
      helper: `${formatNumber(kpis.total_locations)} active locations`,
    },
    {
      label: "Empty Locations",
      value: kpis.empty_locations,
      helper: "Available shelf locations",
    },
  ];

  const visibleQuickActions = profileResolved
    ? quickActions.filter((action) => canAccessPath(activeRole, action.href))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Inventory, warehouse, and QR operation overview.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {card.label}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {formatNumber(card.value)}
            </h3>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {card.helper}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Recent Stock Movements
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Latest inventory activity from Supabase.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
            <table className="min-w-[720px] divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Date
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentMovements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No stock movements found.
                    </td>
                  </tr>
                ) : (
                  recentMovements.map((movement) => (
                    <tr key={movement.movement_id}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {movement.sku}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {movement.product_name}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {formatMovementType(movement.movement_type)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {formatNumber(movement.quantity)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {movement.to_location_code || movement.from_location_code || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(movement.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Quick Actions
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Common operations available to your role.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3">
            {!profileResolved ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading available actions...
              </p>
            ) : visibleQuickActions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No quick actions are available for this account.
              </p>
            ) : (
              visibleQuickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  {action.label}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
