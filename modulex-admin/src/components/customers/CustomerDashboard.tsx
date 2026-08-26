"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { CustomerOrderStatus } from "@/lib/customers/types";

type DashboardStats = {
  total_customers: number;
  active_customers: number;
  portal_enabled: number;
  prospects: number;
  open_orders: number;
  ready_to_ship: number;
  installation: number;
  open_order_value: number | string;
};

type RecentOrder = {
  id: string;
  customer_id: string;
  order_number: string;
  order_date: string | null;
  status: CustomerOrderStatus;
  grand_total: number | string | null;
  total_amount: number | string | null;
  customer_name: string | null;
  customer_code: string | null;
};

type RecentCustomer = {
  id: string;
  customer_code: string;
  name: string;
  status: string;
};

type CustomerDashboardPayload = {
  stats: DashboardStats;
  recent_orders: RecentOrder[];
  recent_customers: RecentCustomer[];
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function money(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return moneyFormatter.format(Number.isFinite(number) ? number : 0);
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function orderGrandTotal(order: RecentOrder) {
  const grand = Number(order.grand_total ?? 0);
  return grand > 0 || Number(order.total_amount ?? 0) === 0
    ? grand
    : Number(order.total_amount ?? 0);
}

function statusClass(status: CustomerOrderStatus) {
  if (status === "completed") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  }

  if (status === "cancelled") {
    return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  }

  if (
    ["shipped", "delivered", "installation_scheduled", "installation_in_progress"].includes(
      status
    )
  ) {
    return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  }

  if (["confirmed", "in_preparation", "ready_for_shipment"].includes(status)) {
    return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  }

  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function CustomerDashboard() {
  const [payload, setPayload] = useState<CustomerDashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();

      if (!mounted) return;

      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }

      const allowed = ["super_admin", "admin", "sales"].includes(profile?.role ?? "");
      setHasAccess(allowed);

      if (!allowed) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_customer_dashboard", {
        p_recent_orders: 8,
        p_recent_customers: 7,
      });

      if (!mounted) return;

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setPayload(data as CustomerDashboardPayload);
      setIsLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading customer dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        You do not have access to customer management.
      </div>
    );
  }

  if (errorMessage || !payload) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        {errorMessage ?? "Customer dashboard could not be loaded."}
      </div>
    );
  }

  const { stats, recent_orders: orders, recent_customers: customers } = payload;
  const cards = [
    ["Customers", stats.total_customers, `${stats.active_customers} active`],
    ["Prospects", stats.prospects, "Potential customers"],
    ["Portal Enabled", stats.portal_enabled, "Customer web access"],
    ["Open Orders", stats.open_orders, money(stats.open_order_value)],
    ["Ready to Ship", stats.ready_to_ship, "Orders waiting for shipment"],
    ["Installation", stats.installation, "Scheduled / in progress"],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Customer Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Customer, order and fulfillment overview.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/customers"
            className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            Customer List
          </Link>
          <Link
            href="/customers/orders"
            className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            All Orders
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {cards.map(([label, value, helper]) => (
          <div
            key={label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {value}
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-8">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Recent Orders
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Latest customer order activity.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr>
                  {["Order", "Customer", "Date", "Status", "Total"].map((label) => (
                    <th
                      key={label}
                      className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <Link
                        href={`/customers/${order.customer_id}/orders/${order.id}`}
                        className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                      >
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {order.customer_name ?? "Unknown customer"}
                      </p>
                      <p className="text-xs text-gray-400">{order.customer_code}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {date(order.order_date)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                          order.status
                        )}`}
                      >
                        {titleCase(order.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">
                      {money(orderGrandTotal(order))}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Recent Customers
          </h2>
          <div className="mt-4 space-y-3">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="block rounded-xl border border-gray-200 p-3 transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {customer.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{customer.customer_code}</p>
                  </div>
                  <span className="text-xs capitalize text-gray-500 dark:text-gray-400">
                    {customer.status}
                  </span>
                </div>
              </Link>
            ))}
            {customers.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No customers yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
