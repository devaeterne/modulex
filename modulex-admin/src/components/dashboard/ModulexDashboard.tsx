"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import { canAccessPath } from "@/lib/auth/permissions";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";

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
      <ComponentCard title="Dashboard" desc="Inventory, warehouse, and QR operation overview.">
        <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading dashboard...
          </p>
        </div>
      </ComponentCard>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="Dashboard could not be loaded" message={errorMessage} />
        <Button onClick={() => setRetryToken((current) => current + 1)}>Try again</Button>
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
        <ComponentCard className="xl:col-span-7" title="Recent Stock Movements" desc="Latest inventory activity from Supabase.">
          <TableViewport>
            <Table variant="admin" className="min-w-[720px]">
              <TableHeader variant="admin">
                <TableRow>
                  {["Product", "Type", "Quantity", "Location", "Date"].map((label) => (
                    <TableCell key={label} isHeader variant="admin" className="text-left">{label}</TableCell>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody variant="admin">
                {recentMovements.length === 0 ? (
                  <TableRow>
                    <TableCell variant="admin" colSpan={5} className="py-6 text-center">
                      No stock movements found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentMovements.map((movement) => (
                    <TableRow key={movement.movement_id}>
                      <TableCell variant="admin">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {movement.sku}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {movement.product_name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell variant="admin">
                        {formatMovementType(movement.movement_type)}
                      </TableCell>
                      <TableCell variant="admin">
                        {formatNumber(movement.quantity)}
                      </TableCell>
                      <TableCell variant="admin">
                        {movement.to_location_code || movement.from_location_code || "-"}
                      </TableCell>
                      <TableCell variant="admin" className="text-gray-500 dark:text-gray-400">
                        {formatDate(movement.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>

        <ComponentCard className="xl:col-span-5" title="Quick Actions" desc="Common operations available to your role.">
          <div className="grid grid-cols-1 gap-3">
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
        </ComponentCard>
      </div>
    </div>
  );
}
