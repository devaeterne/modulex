"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import type { CustomerOrder, CustomerOrderStatus } from "@/lib/customers/types";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
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

type CustomerLookup = {
  id: string;
  customer_code: string;
  name: string;
};

type OrderSummary = {
  total: number;
  open: number;
  completed: number;
  currencyCount: number;
  totalValue: number;
  currencyCode: string | null;
};

type OrderSummaryRow = {
  total_count: number | string | null;
  open_count: number | string | null;
  completed_count: number | string | null;
  currency_count: number | string | null;
  total_value: number | string | null;
  currency_code: string | null;
};

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

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default function CustomerOrdersList({ customerId }: { customerId?: string }) {
  const [customers, setCustomers] = useState<CustomerLookup[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLookup | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"all" | CustomerOrderStatus>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [filteredCount, setFilteredCount] = useState(0);
  const [summary, setSummary] = useState<OrderSummary>({
    total: 0,
    open: 0,
    completed: 0,
    currencyCount: 0,
    totalValue: 0,
    currencyCode: null,
  });

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const startRow = filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, filteredCount);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get("q") ?? "";
    const initialStatus = params.get("status");
    const initialSize = parsePositiveInteger(params.get("size"), 50);

    setSearchQuery(initialSearch);
    setDebouncedSearch(initialSearch.trim());
    setStatus(
      initialStatus && ORDER_STATUSES.includes(initialStatus as CustomerOrderStatus)
        ? (initialStatus as CustomerOrderStatus)
        : "all"
    );
    setCurrentPage(parsePositiveInteger(params.get("page"), 1));
    setPageSize(
      PAGE_SIZE_OPTIONS.includes(initialSize as (typeof PAGE_SIZE_OPTIONS)[number])
        ? initialSize
        : 50
    );
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;

    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, defaultValue = "") => {
      if (!value || value === defaultValue) params.delete(key);
      else params.set(key, value);
    };

    setOrDelete("q", searchQuery.trim());
    setOrDelete("status", status, "all");
    setOrDelete("page", String(currentPage), "1");
    setOrDelete("size", String(pageSize), "50");

    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [urlReady, searchQuery, status, currentPage, pageSize]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_customer_order_list_summary", {
      p_customer_id: customerId ?? null,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const row = ((data ?? [])[0] ?? null) as OrderSummaryRow | null;
    if (!row) {
      setSummary({ total: 0, open: 0, completed: 0, currencyCount: 0, totalValue: 0, currencyCode: null });
      return;
    }

    setSummary({
      total: Number(row.total_count ?? 0),
      open: Number(row.open_count ?? 0),
      completed: Number(row.completed_count ?? 0),
      currencyCount: Number(row.currency_count ?? 0),
      totalValue: Number(row.total_value ?? 0),
      currencyCode: row.currency_code,
    });
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setIsLoading(true);
      setErrorMessage(null);

      const { profile, error: profileError } = await getCurrentProfile();
      if (cancelled) return;
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

      if (customerId) {
        const { data, error } = await supabase
          .from("customers")
          .select("id, customer_code, name")
          .eq("id", customerId)
          .single();
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message);
          setIsLoading(false);
          return;
        }
        setSelectedCustomer(data as CustomerLookup);
      } else {
        setSelectedCustomer(null);
      }

      setAuthReady(true);
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (!authReady) return;
    void loadSummary();
  }, [authReady, loadSummary]);

  useEffect(() => {
    if (!authReady || !urlReady) return;

    let cancelled = false;

    async function loadOrders() {
      setIsLoading(true);
      setErrorMessage(null);

      let searchCustomerIds: string[] = [];
      if (normalizedSearch) {
        const customerPattern = quotePostgrestValue(`%${debouncedSearch.trim()}%`);
        let customerSearch = supabase
          .from("customers")
          .select("id")
          .or(`customer_code.ilike.${customerPattern},name.ilike.${customerPattern}`);
        if (customerId) customerSearch = customerSearch.eq("id", customerId);

        const customerSearchResult = await customerSearch;
        if (cancelled) return;
        if (customerSearchResult.error) {
          setErrorMessage(customerSearchResult.error.message);
          setOrders([]);
          setCustomers([]);
          setFilteredCount(0);
          setIsLoading(false);
          return;
        }
        searchCustomerIds = (customerSearchResult.data ?? []).map((row) => row.id);
      }

      let query = supabase
        .from("customer_orders")
        .select("*", { count: "exact" });

      if (customerId) query = query.eq("customer_id", customerId);
      if (status !== "all") query = query.eq("status", status);

      if (normalizedSearch) {
        const pattern = quotePostgrestValue(`%${debouncedSearch.trim()}%`);
        const filters = [
          `order_number.ilike.${pattern}`,
          `customer_reference.ilike.${pattern}`,
          `payment_method_name_snapshot.ilike.${pattern}`,
        ];
        if (searchCustomerIds.length) {
          filters.push(`customer_id.in.(${searchCustomerIds.join(",")})`);
        }
        query = query.or(filters.join(","));
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const ordersResult = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (cancelled) return;
      if (ordersResult.error) {
        setErrorMessage(ordersResult.error.message);
        setOrders([]);
        setCustomers([]);
        setFilteredCount(0);
        setIsLoading(false);
        return;
      }

      const pageOrders = (ordersResult.data ?? []) as CustomerOrder[];
      let pageCustomers: CustomerLookup[] = selectedCustomer ? [selectedCustomer] : [];

      if (!customerId) {
        const customerIds = [...new Set(pageOrders.map((order) => order.customer_id))];
        if (customerIds.length) {
          const customerResult = await supabase
            .from("customers")
            .select("id, customer_code, name")
            .in("id", customerIds);
          if (cancelled) return;
          if (customerResult.error) {
            setErrorMessage(customerResult.error.message);
            setOrders([]);
            setCustomers([]);
            setFilteredCount(0);
            setIsLoading(false);
            return;
          }
          pageCustomers = (customerResult.data ?? []) as CustomerLookup[];
        } else {
          pageCustomers = [];
        }
      }

      setOrders(pageOrders);
      setCustomers(pageCustomers);
      setFilteredCount(ordersResult.count ?? 0);
      setIsLoading(false);
    }

    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    urlReady,
    customerId,
    selectedCustomer,
    currentPage,
    pageSize,
    status,
    normalizedSearch,
    debouncedSearch,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const totalValueLabel =
    summary.currencyCount <= 1
      ? money(summary.totalValue, summary.currencyCode || selectedCustomer?.id ? summary.currencyCode || "USD" : summary.currencyCode || "USD")
      : "Multiple currencies";

  if (isLoading && !orders.length) {
    return <Loading label="Loading orders..." />;
  }
  if (errorMessage && !orders.length) {
    return <ErrorBox>{errorMessage}</ErrorBox>;
  }

  return (
    <div className="space-y-5">
      {errorMessage && <ErrorBox>{errorMessage}</ErrorBox>}

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
        <Summary label="Orders" value={summary.total.toString()} />
        <Summary label="Open" value={summary.open.toString()} />
        <Summary label="Completed" value={summary.completed.toString()} />
        <Summary label="Total Value" value={totalValueLabel} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-3 border-b border-gray-200 p-4 md:grid-cols-[1fr_240px] dark:border-gray-800">
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search order, reference, payment or customer..."
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "all" | CustomerOrderStatus);
              setCurrentPage(1);
            }}
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
              {orders.map((order) => {
                const customer = selectedCustomer ?? customerMap.get(order.customer_id);
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
              {orders.length === 0 && (
                <tr><td colSpan={selectedCustomer ? 6 : 7} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No orders found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredCount === 0 ? "0 orders" : `${startRow}–${endRow} of ${filteredCount} orders`}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
            <button disabled={currentPage <= 1 || isLoading} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} className="h-9 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Previous</button>
            <span className="min-w-[75px] text-center text-xs text-gray-500 dark:text-gray-400">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))} className="h-9 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Next</button>
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
