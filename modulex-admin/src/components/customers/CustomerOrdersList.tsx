"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
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

const statusOptions: Array<{ value: "all" | CustomerOrderStatus; label: string }> = [
  { value: "all", label: "All Statuses" },
  ...ORDER_STATUSES.map((value) => ({ value, label: titleCase(value) })),
];

const pageSizeOptions = PAGE_SIZE_OPTIONS.map((size) => ({
  value: String(size),
  label: `${size} / page`,
}));

type CustomerLookup = {
  id: string;
  customer_code: string;
  name: string;
};

type OrderDirectoryRow = CustomerOrder & {
  customer_code: string;
  customer_name: string;
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

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

function money(value: string | number | null | undefined, currency = "USD") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      Number.isFinite(amount) ? amount : 0
    );
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
      Number.isFinite(amount) ? amount : 0
    );
  }
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function badgeColor(status: CustomerOrderStatus): BadgeColor {
  if (status === "completed" || status === "delivered") return "success";
  if (status === "cancelled") return "error";
  if (["shipped", "installation_scheduled", "installation_in_progress"].includes(status)) return "info";
  if (["confirmed", "in_preparation", "ready_for_shipment"].includes(status)) return "warning";
  return "light";
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
  const router = useRouter();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLookup | null>(null);
  const [orders, setOrders] = useState<OrderDirectoryRow[]>([]);
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
  const [refreshToken, setRefreshToken] = useState(0);
  const [summary, setSummary] = useState<OrderSummary>({
    total: 0,
    open: 0,
    completed: 0,
    currencyCount: 0,
    totalValue: 0,
    currencyCode: null,
  });

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const startRow = filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, filteredCount);
  const columnCount = selectedCustomer ? 6 : 7;
  const totalValueLabel =
    summary.currencyCount <= 1
      ? money(summary.totalValue, summary.currencyCode || "USD")
      : "Multiple currencies";

  const headerActions = useMemo(() => {
    if (!selectedCustomer) return undefined;
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/customers/${selectedCustomer.id}`)}
        >
          Customer Card
        </Button>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => router.push(`/customers/${selectedCustomer.id}/orders/new`)}
          >
            New Order
          </Button>
        ) : null}
      </div>
    );
  }, [canManage, router, selectedCustomer]);

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
      setAuthReady(false);

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
  }, [customerId, refreshToken]);

  useEffect(() => {
    if (!authReady) return;
    void loadSummary();
  }, [authReady, loadSummary, refreshToken]);

  useEffect(() => {
    if (!authReady || !urlReady) return;

    let cancelled = false;

    async function loadOrders() {
      setIsLoading(true);
      setErrorMessage(null);

      let query = supabase
        .from("customer_order_directory")
        .select("*", { count: "exact" });

      if (customerId) query = query.eq("customer_id", customerId);
      if (status === "all") query = query.neq("status", "cancelled");
      else query = query.eq("status", status);

      if (normalizedSearch) {
        const pattern = quotePostgrestValue(`%${debouncedSearch.trim()}%`);
        query = query.or([
          `order_number.ilike.${pattern}`,
          `customer_reference.ilike.${pattern}`,
          `payment_method_name_snapshot.ilike.${pattern}`,
          `customer_code.ilike.${pattern}`,
          `customer_name.ilike.${pattern}`,
        ].join(","));
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
        setFilteredCount(0);
        setIsLoading(false);
        return;
      }

      setOrders((ordersResult.data ?? []) as OrderDirectoryRow[]);
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
    currentPage,
    pageSize,
    status,
    normalizedSearch,
    debouncedSearch,
    refreshToken,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-5">
      {errorMessage ? (
        <div className="space-y-3" role="alert">
          <Alert variant="error" title="Orders could not be loaded" message={errorMessage} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshToken((value) => value + 1)}
            disabled={isLoading}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <ComponentCard
        title={selectedCustomer ? `${selectedCustomer.name} Orders` : "Customer Orders"}
        desc={
          selectedCustomer
            ? `${selectedCustomer.customer_code} • order history`
            : "Review customer orders and fulfillment status."
        }
        headerAction={headerActions}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ComponentCard title="Orders"><p className="text-xl font-semibold">{summary.total}</p></ComponentCard>
          <ComponentCard title="Open"><p className="text-xl font-semibold">{summary.open}</p></ComponentCard>
          <ComponentCard title="Completed"><p className="text-xl font-semibold">{summary.completed}</p></ComponentCard>
          <ComponentCard title="Total Value"><p className="text-xl font-semibold">{totalValueLabel}</p></ComponentCard>
        </div>
      </ComponentCard>

      <ComponentCard
        title="Order Directory"
        desc={status === "all" ? "Cancelled Orders are hidden until the Cancelled status filter is selected." : "Review Orders matching the current filters."}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px_160px]">
          <div>
            <Label htmlFor="order-search">Search</Label>
            <Input
              id="order-search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Order, reference, payment or customer"
            />
          </div>
          <div>
            <Label htmlFor="order-status">Status</Label>
            <Select
              id="order-status"
              options={statusOptions}
              value={status}
              onChange={(value) => {
                setStatus(value as "all" | CustomerOrderStatus);
                setCurrentPage(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="order-page-size">Rows</Label>
            <Select
              id="order-page-size"
              options={pageSizeOptions}
              value={String(pageSize)}
              onChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Order</TableCell>
                {!selectedCustomer ? <TableCell isHeader variant="admin">Customer</TableCell> : null}
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Fulfillment</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Items</TableCell>
                <TableCell isHeader variant="admin">Total</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {isLoading ? <TableStateRow colSpan={columnCount}>Loading orders…</TableStateRow> : null}
              {!isLoading && orders.length === 0 ? <TableStateRow colSpan={columnCount}>No orders match the current filters.</TableStateRow> : null}
              {!isLoading ? orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell variant="admin">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/customers/${order.customer_id}/orders/${order.id}`)}
                    >
                      {order.order_number}
                    </Button>
                    <p className="mt-1 text-xs">{order.customer_reference || "No reference"}</p>
                  </TableCell>
                  {!selectedCustomer ? (
                    <TableCell variant="admin">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/customers/${order.customer_id}`)}
                      >
                        {order.customer_name}
                      </Button>
                      <p className="mt-1 text-xs">{order.customer_code}</p>
                    </TableCell>
                  ) : null}
                  <TableCell variant="admin">{date(order.order_date)}</TableCell>
                  <TableCell variant="admin">{titleCase(order.fulfillment_type || "delivery")}</TableCell>
                  <TableCell variant="admin"><Badge color={badgeColor(order.status)}>{titleCase(order.status)}</Badge></TableCell>
                  <TableCell variant="admin">{order.item_count}</TableCell>
                  <TableCell variant="admin" className="text-right font-semibold">{money(grandTotal(order), order.currency_code)}</TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" aria-live="polite">
            {filteredCount === 0 ? "0 orders" : `${startRow}–${endRow} of ${filteredCount} orders`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <span className="min-w-[75px] text-center text-sm">{currentPage} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
