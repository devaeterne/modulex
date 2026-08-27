"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import type { Customer, CustomerOrder, CustomerOrderStatus } from "@/lib/customers/types";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const ORDER_STATUSES: CustomerOrderStatus[] = [
  "draft",
  "confirmed",
  "in_preparation",
  "ready_for_shipment",
  "shipped",
  "delivered",
  "installation_scheduled",
  "installation_in_progress",
  "completed",
  "cancelled",
];

function money(value: string | number | null | undefined, currency = "USD") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number.isFinite(amount) ? amount : 0
    );
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      Number.isFinite(amount) ? amount : 0
    );
  }
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function badge(status: CustomerOrderStatus) {
  if (status === "completed") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "cancelled") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (["shipped", "delivered", "installation_scheduled", "installation_in_progress"].includes(status)) return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  if (["confirmed", "in_preparation", "ready_for_shipment"].includes(status)) return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function grandTotal(order: CustomerOrder) {
  const grand = Number(order.grand_total ?? 0);
  return grand > 0 || Number(order.total_amount ?? 0) === 0
    ? grand
    : Number(order.total_amount ?? 0);
}

export default function CustomerOrdersList({ customerId }: { customerId?: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CustomerOrderStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      const { profile, error: profileError } = await getCurrentProfile();
      if (!mounted) return;
      if (profileError || !profile) {
        setErrorMessage(profileError?.message ?? "User profile could not be loaded.");
        setIsLoading(false);
        return;
      }
      if (!hasPermission(profile.role, "orders.view")) {
        setErrorMessage("You do not have permission to view customer orders.");
        setIsLoading(false);
        return;
      }
      setCanManage(hasPermission(profile.role, "orders.manage"));

      const customersQuery = customerId
        ? supabase.from("customers").select("*").eq("id", customerId)
        : supabase.from("customers").select("*").order("name");
      let ordersQuery = supabase
        .from("customer_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (customerId) ordersQuery = ordersQuery.eq("customer_id", customerId);

      const [customersResult, ordersResult] = await Promise.all([customersQuery, ordersQuery]);
      if (!mounted) return;
      const firstError = customersResult.error || ordersResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setCustomers((customersResult.data ?? []) as Customer[]);
      setOrders((ordersResult.data ?? []) as CustomerOrder[]);
      setIsLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [customerId]);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );
  const selectedCustomer = customerId ? customers[0] ?? null : null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const customer = customerMap.get(order.customer_id);
      const matchesSearch =
        !query ||
        order.order_number.toLowerCase().includes(query) ||
        (order.customer_reference ?? "").toLowerCase().includes(query) ||
        (order.payment_method_name_snapshot ?? "").toLowerCase().includes(query) ||
        (customer?.name ?? "").toLowerCase().includes(query) ||
        (customer?.customer_code ?? "").toLowerCase().includes(query);
      return matchesSearch && (status === "all" || order.status === status);
    });
  }, [orders, search, status, customerMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const openOrders = orders.filter((order) => !["completed", "cancelled"].includes(order.status));
  const currencies = [...new Set(orders.map((order) => order.currency_code).filter(Boolean))];
  const totalValue = orders.reduce((sum, order) => sum + grandTotal(order), 0);
  const totalValueLabel = currencies.length <= 1 ? money(totalValue, currencies[0] || "USD") : "Multiple currencies";

  if (isLoading) {
    return <Loading label="Loading orders..." />;
  }
  if (errorMessage) {
    return <ErrorBox>{errorMessage}</ErrorBox>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {selectedCustomer ? `${selectedCustomer.name} Orders` : "Customer Orders"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {selectedCustomer
              ? `${selectedCustomer.customer_code} • order history`
              : "Review customer orders and fulfillment status."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedCustomer && (
            <Link href={`/customers/${selectedCustomer.id}`} className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]">
              Customer Card
            </Link>
          )}
          {selectedCustomer && canManage && (
            <Link href={`/customers/${selectedCustomer.id}/orders/new`} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
              New Order
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Orders" value={orders.length.toString()} />
        <Summary label="Open" value={openOrders.length.toString()} />
        <Summary label="Completed" value={orders.filter((order) => order.status === "completed").length.toString()} />
        <Summary label="Total Value" value={totalValueLabel} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-3 border-b border-gray-200 p-4 md:grid-cols-[1fr_240px] dark:border-gray-800">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, reference, payment or customer..."
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | CustomerOrderStatus)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="all">All Statuses</option>
            {ORDER_STATUSES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {["Order", ...(selectedCustomer ? [] : ["Customer"]), "Date", "Fulfillment", "Status", "Items", "Total"].map((label) => (
                  <th key={label} className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {page.map((order) => {
                const customer = customerMap.get(order.customer_id);
                return (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <Link href={`/customers/${order.customer_id}/orders/${order.id}`} className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                        {order.order_number}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-400">{order.customer_reference || "No reference"}</p>
                    </td>
                    {!selectedCustomer && (
                      <td className="px-5 py-4">
                        <Link href={`/customers/${order.customer_id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400">
                          {customer?.name ?? "Unknown"}
                        </Link>
                        <p className="text-xs text-gray-400">{customer?.customer_code}</p>
                      </td>
                    )}
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{date(order.order_date)}</td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{titleCase(order.fulfillment_type || "delivery")}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge(order.status)}`}>{titleCase(order.status)}</span></td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{order.item_count}</td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-gray-800 dark:text-white/90">{money(grandTotal(order), order.currency_code)}</td>
                  </tr>
                );
              })}
              {page.length === 0 && (
                <tr><td colSpan={selectedCustomer ? 6 : 7} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No orders found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} orders</p>
          <div className="flex items-center gap-2">
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
            <button disabled={currentPage <= 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} className="h-9 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Previous</button>
            <span className="min-w-[75px] text-center text-xs text-gray-500 dark:text-gray-400">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} className="h-9 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-xs text-gray-500 dark:text-gray-400">{label}</p><p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}

function Loading({ label }: { label: string }) {
  return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p></div></div>;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{children}</div>;
}
