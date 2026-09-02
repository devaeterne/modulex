"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type {
  Customer,
  CustomerStatus,
  CustomerType,
  PriceGroupLookup,
  ProfileLookup,
} from "@/lib/customers/types";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500";

const selectClass = inputClass;

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const CUSTOMER_STATUSES: CustomerStatus[] = ["active", "inactive", "blocked", "prospect"];

type PortalFilter = "all" | "enabled" | "disabled";
type Summary = { total: number; active: number; prospects: number; portal: number };
type CustomerDashboardSummary = {
  stats: {
    total_customers: number;
    active_customers: number;
    prospects: number;
    portal_enabled: number;
  };
};

function statusClass(status: CustomerStatus) {
  if (status === "active") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  }

  if (status === "blocked") {
    return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  }

  if (status === "prospect") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  }

  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default function CustomersTable() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupLookup[]>([]);
  const [profiles, setProfiles] = useState<ProfileLookup[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [referenceReady, setReferenceReady] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CustomerStatus>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [priceGroupFilter, setPriceGroupFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState<PortalFilter>("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [filteredCount, setFilteredCount] = useState(0);
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, prospects: 0, portal: 0 });

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    legal_name: "",
    customer_type_id: "",
    status: "prospect" as CustomerStatus,
    email: "",
    phone: "",
    country_code: "",
    price_group_id: "",
    sales_rep_id: "",
  });

  const typeMap = useMemo(
    () => new Map(customerTypes.map((item) => [item.id, item.name])),
    [customerTypes]
  );

  const groupMap = useMemo(
    () => new Map(priceGroups.map((item) => [item.id, item.name])),
    [priceGroups]
  );

  const profileMap = useMemo(
    () =>
      new Map(
        profiles.map((item) => [
          item.id,
          item.full_name || item.email || "Unknown user",
        ])
      ),
    [profiles]
  );

  const normalizedSearch = debouncedSearch.trim().toLowerCase();

  const searchCustomerTypeIds = useMemo(
    () =>
      normalizedSearch
        ? customerTypes
            .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
            .map((item) => item.id)
        : [],
    [customerTypes, normalizedSearch]
  );

  const searchPriceGroupIds = useMemo(
    () =>
      normalizedSearch
        ? priceGroups
            .filter((item) => item.name.toLowerCase().includes(normalizedSearch))
            .map((item) => item.id)
        : [],
    [priceGroups, normalizedSearch]
  );

  const searchSalesRepIds = useMemo(
    () =>
      normalizedSearch
        ? profiles
            .filter((item) =>
              `${item.full_name ?? ""} ${item.email ?? ""}`.toLowerCase().includes(normalizedSearch)
            )
            .map((item) => item.id)
        : [],
    [profiles, normalizedSearch]
  );

  const activeFilterCount = [
    searchQuery.trim(),
    statusFilter !== "all" ? statusFilter : "",
    typeFilter,
    priceGroupFilter,
    countryFilter,
    salesRepFilter,
    portalFilter !== "all" ? portalFilter : "",
  ].filter(Boolean).length;

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const startRow = filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, filteredCount);

  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_customer_dashboard", {
      p_recent_orders: 0,
      p_recent_customers: 0,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const { stats } = data as CustomerDashboardSummary;
    setSummary({
      total: stats.total_customers,
      active: stats.active_customers,
      prospects: stats.prospects,
      portal: stats.portal_enabled,
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get("q") ?? "";
    const initialStatus = params.get("status");
    const initialPortal = params.get("portal");
    const initialSize = parsePositiveInteger(params.get("size"), 50);

    setSearchQuery(initialSearch);
    setDebouncedSearch(initialSearch.trim());
    setStatusFilter(
      initialStatus && CUSTOMER_STATUSES.includes(initialStatus as CustomerStatus)
        ? (initialStatus as CustomerStatus)
        : "all"
    );
    setTypeFilter(params.get("type") ?? "");
    setPriceGroupFilter(params.get("group") ?? "");
    setCountryFilter((params.get("country") ?? "").toUpperCase().slice(0, 2));
    setSalesRepFilter(params.get("rep") ?? "");
    setPortalFilter(
      initialPortal === "enabled" || initialPortal === "disabled" ? initialPortal : "all"
    );
    setCurrentPage(parsePositiveInteger(params.get("page"), 1));
    setPageSize(PAGE_SIZE_OPTIONS.includes(initialSize as (typeof PAGE_SIZE_OPTIONS)[number]) ? initialSize : 50);
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
    setOrDelete("status", statusFilter, "all");
    setOrDelete("type", typeFilter);
    setOrDelete("group", priceGroupFilter);
    setOrDelete("country", countryFilter);
    setOrDelete("rep", salesRepFilter);
    setOrDelete("portal", portalFilter, "all");
    setOrDelete("page", String(currentPage), "1");
    setOrDelete("size", String(pageSize), "50");

    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [
    urlReady,
    searchQuery,
    statusFilter,
    typeFilter,
    priceGroupFilter,
    countryFilter,
    salesRepFilter,
    portalFilter,
    currentPage,
    pageSize,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    async function initialize() {
      setIsLoading(true);
      setErrorMessage(null);

      const [{ profile, error: profileError }, typesResult, groupsResult, profilesResult] =
        await Promise.all([
          getCurrentProfile(),
          supabase
            .from("customer_types")
            .select("id, system_key, name, sort_order, is_active")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("price_groups")
            .select("id, name, system_key, sort_order, is_base_price, is_active")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("profiles")
            .select("id, full_name, email, role, is_active")
            .eq("is_active", true)
            .order("full_name"),
        ]);

      const firstError = profileError || typesResult.error || groupsResult.error || profilesResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setCanManage(
        profile?.role === "super_admin" ||
          profile?.role === "admin" ||
          profile?.role === "sales"
      );
      setCustomerTypes((typesResult.data ?? []) as CustomerType[]);
      setPriceGroups((groupsResult.data ?? []) as PriceGroupLookup[]);
      setProfiles((profilesResult.data ?? []) as ProfileLookup[]);
      await loadSummary();
      setReferenceReady(true);
    }

    void initialize();
  }, [loadSummary]);

  useEffect(() => {
    if (!referenceReady || !urlReady) return;

    let cancelled = false;

    async function loadDirectory() {
      setIsLoading(true);
      setErrorMessage(null);

      let query = supabase.from("customers").select("*", { count: "exact" });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter) query = query.eq("customer_type_id", typeFilter);
      if (priceGroupFilter) query = query.eq("price_group_id", priceGroupFilter);
      if (countryFilter) query = query.eq("country_code", countryFilter);
      if (salesRepFilter) query = query.eq("sales_rep_id", salesRepFilter);
      if (portalFilter !== "all") query = query.eq("portal_enabled", portalFilter === "enabled");

      if (normalizedSearch) {
        const pattern = quotePostgrestValue(`%${debouncedSearch.trim()}%`);
        const filters = [
          `customer_code.ilike.${pattern}`,
          `name.ilike.${pattern}`,
          `legal_name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `phone.ilike.${pattern}`,
          `tax_number.ilike.${pattern}`,
        ];

        if (searchCustomerTypeIds.length) {
          filters.push(`customer_type_id.in.(${searchCustomerTypeIds.join(",")})`);
        }
        if (searchPriceGroupIds.length) {
          filters.push(`price_group_id.in.(${searchPriceGroupIds.join(",")})`);
        }
        if (searchSalesRepIds.length) {
          filters.push(`sales_rep_id.in.(${searchSalesRepIds.join(",")})`);
        }

        query = query.or(filters.join(","));
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (cancelled) return;
      if (error) {
        setErrorMessage(error.message);
        setCustomers([]);
        setFilteredCount(0);
        setIsLoading(false);
        return;
      }

      setCustomers((data ?? []) as Customer[]);
      setFilteredCount(count ?? 0);
      setIsLoading(false);
    }

    void loadDirectory();
    return () => {
      cancelled = true;
    };
  }, [
    referenceReady,
    urlReady,
    refreshToken,
    currentPage,
    pageSize,
    statusFilter,
    typeFilter,
    priceGroupFilter,
    countryFilter,
    salesRepFilter,
    portalFilter,
    normalizedSearch,
    debouncedSearch,
    searchCustomerTypeIds,
    searchPriceGroupIds,
    searchSalesRepIds,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function resetToFirstPage() {
    setCurrentPage(1);
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("");
    setPriceGroupFilter("");
    setCountryFilter("");
    setSalesRepFilter("");
    setPortalFilter("all");
    resetToFirstPage();
  }

  function resetNewCustomer() {
    setNewCustomer({
      name: "",
      legal_name: "",
      customer_type_id: "",
      status: "prospect",
      email: "",
      phone: "",
      country_code: "",
      price_group_id: "",
      sales_rep_id: "",
    });
  }

  async function createCustomer() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newCustomer.name.trim()) {
      setErrorMessage("Customer name is required.");
      return;
    }

    setIsSaving(true);

    const payload = {
      customer_code: "",
      name: newCustomer.name.trim(),
      legal_name: newCustomer.legal_name.trim() || null,
      customer_type_id: newCustomer.customer_type_id || null,
      status: newCustomer.status,
      email: newCustomer.email.trim() || null,
      phone: newCustomer.phone.trim() || null,
      country_code: newCustomer.country_code.trim().toUpperCase() || null,
      price_group_id: newCustomer.price_group_id || null,
      sales_rep_id: newCustomer.sales_rep_id || null,
      customer_since: new Date().toISOString().slice(0, 10),
    };

    const { data, error } = await supabase
      .from("customers")
      .insert(payload)
      .select("id, customer_code")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    await supabase.from("customer_activity").insert({
      customer_id: data.id,
      activity_type: "customer_created",
      title: "Customer created",
      description: `Customer ${data.customer_code} was created.`,
    });

    setCreateOpen(false);
    resetNewCustomer();
    await loadSummary();
    resetToFirstPage();
    setRefreshToken((value) => value + 1);
    setSuccessMessage(`Customer ${data.customer_code} created successfully.`);
    setIsSaving(false);
  }

  return (
    <div className="space-y-5">
      {errorMessage && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
          {successMessage}
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard label="Total Customers" value={summary.total} />
          <SummaryCard label="Active" value={summary.active} type="success" />
          <SummaryCard label="Prospects" value={summary.prospects} type="warning" />
          <SummaryCard label="Portal Enabled" value={summary.portal} type="brand" />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Customers</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Customer master data, pricing groups and portal accounts.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                className={
                  filtersOpen || activeFilterCount
                    ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 shadow-theme-xs dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                    : secondaryButtonClass
                }
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {canManage && (
                <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
                  New Customer
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filtersOpen && (
            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Filters</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Server-side filters are reflected in the URL so views can be shared or revisited.
                  </p>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-600 dark:text-brand-400"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <div className="xl:col-span-2">
                  <FilterLabel>Search</FilterLabel>
                  <input
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      resetToFirstPage();
                    }}
                    placeholder="Code, company, email, tax number..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <FilterLabel>Status</FilterLabel>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value as "all" | CustomerStatus);
                      resetToFirstPage();
                    }}
                    className={selectClass}
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="prospect">Prospect</option>
                    <option value="inactive">Inactive</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>

                <div>
                  <FilterLabel>Customer Type</FilterLabel>
                  <select
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value);
                      resetToFirstPage();
                    }}
                    className={selectClass}
                  >
                    <option value="">All Types</option>
                    {customerTypes.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <FilterLabel>Price Group</FilterLabel>
                  <select
                    value={priceGroupFilter}
                    onChange={(event) => {
                      setPriceGroupFilter(event.target.value);
                      resetToFirstPage();
                    }}
                    className={selectClass}
                  >
                    <option value="">All Groups</option>
                    {priceGroups.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <FilterLabel>Country</FilterLabel>
                  <input
                    value={countryFilter}
                    maxLength={2}
                    placeholder="US"
                    onChange={(event) => {
                      setCountryFilter(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2));
                      resetToFirstPage();
                    }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <FilterLabel>Portal</FilterLabel>
                  <select
                    value={portalFilter}
                    onChange={(event) => {
                      setPortalFilter(event.target.value as PortalFilter);
                      resetToFirstPage();
                    }}
                    className={selectClass}
                  >
                    <option value="all">All</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>

                <div className="xl:col-span-2">
                  <FilterLabel>Sales Representative</FilterLabel>
                  <select
                    value={salesRepFilter}
                    onChange={(event) => {
                      setSalesRepFilter(event.target.value);
                      resetToFirstPage();
                    }}
                    className={selectClass}
                  >
                    <option value="">All Representatives</option>
                    {profiles
                      .filter((item) => ["super_admin", "admin", "sales"].includes(item.role))
                      .map((item) => (
                        <option key={item.id} value={item.id}>{item.full_name || item.email}</option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
                <p className="text-sm text-gray-500">Loading customers...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-white/[0.02]">
                      <tr>
                        {["Customer", "Type", "Contact", "Country", "Price Group", "Sales Rep", "Portal", "Status", ""].map((label) => (
                          <th
                            key={label || "action"}
                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {customers.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                            No customers found.
                          </td>
                        </tr>
                      ) : (
                        customers.map((customer) => (
                          <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                            <td className="px-4 py-3">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="font-semibold text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                              >
                                {customer.name}
                              </Link>
                              <p className="mt-0.5 text-xs text-gray-400">{customer.customer_code}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                              {customer.customer_type_id ? typeMap.get(customer.customer_type_id) ?? "—" : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-gray-700 dark:text-gray-300">{customer.email || "—"}</p>
                              {customer.phone && <p className="mt-0.5 text-xs text-gray-400">{customer.phone}</p>}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{customer.country_code || "—"}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                              {customer.price_group_id ? groupMap.get(customer.price_group_id) ?? "—" : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                              {customer.sales_rep_id ? profileMap.get(customer.sales_rep_id) ?? "—" : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  customer.portal_enabled
                                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                                    : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                                }`}
                              >
                                {customer.portal_enabled ? "Enabled" : "Disabled"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(customer.status)}`}>
                                {titleCase(customer.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                              >
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing <span className="font-medium text-gray-700 dark:text-gray-300">{startRow}–{endRow}</span> of <span className="font-medium text-gray-700 dark:text-gray-300">{filteredCount}</span>
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      resetToFirstPage();
                    }}
                    className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>{size} / page</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    className={secondaryButtonClass}
                  >
                    Previous
                  </button>
                  <span className="flex h-10 min-w-[90px] items-center justify-center rounded-lg bg-gray-50 px-3 text-xs text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    className={secondaryButtonClass}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">New Customer</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create the customer master record. More details can be added from the customer card.
                </p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-xl text-gray-400 hover:text-gray-700">×</button>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <Field label="Company / Customer Name" required>
                <input
                  value={newCustomer.name}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Legal Name">
                <input
                  value={newCustomer.legal_name}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, legal_name: event.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Customer Type">
                <select
                  value={newCustomer.customer_type_id}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, customer_type_id: event.target.value }))}
                  className={selectClass}
                >
                  <option value="">Default (Company)</option>
                  {customerTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={newCustomer.status}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, status: event.target.value as CustomerStatus }))}
                  className={selectClass}
                >
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={newCustomer.phone}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Country Code">
                <input
                  maxLength={2}
                  placeholder="US"
                  value={newCustomer.country_code}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Price Group">
                <select
                  value={newCustomer.price_group_id}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, price_group_id: event.target.value }))}
                  className={selectClass}
                >
                  <option value="">Default (List / Base)</option>
                  {priceGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Sales Representative">
                <select
                  value={newCustomer.sales_rep_id}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, sales_rep_id: event.target.value }))}
                  className={selectClass}
                >
                  <option value="">Unassigned</option>
                  {profiles
                    .filter((item) => ["super_admin", "admin", "sales"].includes(item.role))
                    .map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}
                </select>
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button type="button" onClick={() => setCreateOpen(false)} className={secondaryButtonClass}>Cancel</button>
              <button type="button" onClick={createCustomer} disabled={isSaving} className={primaryButtonClass}>
                {isSaving ? "Creating..." : "Create Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">{children}</label>;
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}{required && <span className="ml-1 text-error-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  type = "default",
}: {
  label: string;
  value: number;
  type?: "default" | "success" | "warning" | "brand";
}) {
  const classes =
    type === "success"
      ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
      : type === "warning"
        ? "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10"
        : type === "brand"
          ? "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";

  return (
    <div className={`rounded-2xl border p-5 shadow-theme-xs ${classes}`}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}
