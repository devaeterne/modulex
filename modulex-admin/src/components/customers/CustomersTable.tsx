"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import FormHint from "@/components/form/FormHint";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableViewport } from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type {
  Customer,
  CustomerStatus,
  CustomerType,
  PriceGroupLookup,
  ProfileLookup,
} from "@/lib/customers/types";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const CUSTOMER_STATUSES: CustomerStatus[] = ["active", "inactive", "blocked", "prospect"];

type PortalFilter = "all" | "enabled" | "disabled";
type Summary = { total: number; active: number; prospects: number; portal: number };

function statusColor(status: CustomerStatus): "success" | "error" | "warning" | "light" {
  if (status === "active") return "success";
  if (status === "blocked") return "error";
  if (status === "prospect") return "warning";
  return "light";
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
    const [totalResult, activeResult, prospectsResult, portalResult] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "prospect"),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("portal_enabled", true),
    ]);

    const firstError =
      totalResult.error || activeResult.error || prospectsResult.error || portalResult.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      return;
    }

    setSummary({
      total: totalResult.count ?? 0,
      active: activeResult.count ?? 0,
      prospects: prospectsResult.count ?? 0,
      portal: portalResult.count ?? 0,
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
        <Alert variant="error" title="Unable to load customers" message={errorMessage} />
      )}

      {successMessage && (
        <Alert variant="success" title="Customer updated" message={successMessage} />
      )}

      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard label="Total Customers" value={summary.total} />
          <SummaryCard label="Active" value={summary.active} type="success" />
          <SummaryCard label="Prospects" value={summary.prospects} type="warning" />
          <SummaryCard label="Portal Enabled" value={summary.portal} type="brand" />
        </div>
      )}

      <ComponentCard
        title="Customers"
        desc="Customer master data, pricing groups and portal accounts."
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFiltersOpen((current) => !current)}>
              Filters {activeFilterCount > 0 && <Badge color="info">{activeFilterCount}</Badge>}
            </Button>
            {canManage && <Button onClick={() => setCreateOpen(true)}>New Customer</Button>}
          </div>
        }
      >
        <div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filtersOpen && (
            <ComponentCard title="Filters" desc="Server-side filters are reflected in the URL so views can be shared or revisited.">
              <div className="mb-4 flex items-center justify-between">
                <div />
                {activeFilterCount > 0 && (
                  <Button
                    type="button"
                    onClick={clearFilters}
                    variant="outline"
                  >
                    Clear All
                  </Button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                <div className="xl:col-span-2">
                  <FilterLabel>Search</FilterLabel>
                  <Input
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      resetToFirstPage();
                    }}
                    placeholder="Code, company, email, tax number..."
                  />
                </div>

                <div>
                  <FilterLabel>Status</FilterLabel>
                  <Select
                    value={statusFilter}
                    onChange={(value) => {
                      setStatusFilter(value as "all" | CustomerStatus);
                      resetToFirstPage();
                    }}
                    options={[
                      { value: "all", label: "All Statuses" },
                      ...CUSTOMER_STATUSES.map((value) => ({ value, label: titleCase(value) })),
                    ]}
                  />
                </div>

                <div>
                  <FilterLabel>Customer Type</FilterLabel>
                  <Select
                    value={typeFilter}
                    onChange={(value) => {
                      setTypeFilter(value);
                      resetToFirstPage();
                    }}
                    options={customerTypes.map((item) => ({ value: item.id, label: item.name }))}
                    placeholder="All Types"
                    allowEmpty
                  />
                </div>

                <div>
                  <FilterLabel>Price Group</FilterLabel>
                  <Select
                    value={priceGroupFilter}
                    onChange={(value) => {
                      setPriceGroupFilter(value);
                      resetToFirstPage();
                    }}
                    options={priceGroups.map((item) => ({ value: item.id, label: item.name }))}
                    placeholder="All Groups"
                    allowEmpty
                  />
                </div>

                <div>
                  <FilterLabel>Country</FilterLabel>
                  <Input
                    value={countryFilter}
                    maxLength={2}
                    placeholder="US"
                    onChange={(event) => {
                      setCountryFilter(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2));
                      resetToFirstPage();
                    }}
                  />
                </div>

                <div>
                  <FilterLabel>Portal</FilterLabel>
                  <Select
                    value={portalFilter}
                    onChange={(value) => {
                      setPortalFilter(value as PortalFilter);
                      resetToFirstPage();
                    }}
                    options={[
                      { value: "all", label: "All" },
                      { value: "enabled", label: "Enabled" },
                      { value: "disabled", label: "Disabled" },
                    ]}
                  />
                </div>

                <div className="xl:col-span-2">
                  <FilterLabel>Sales Representative</FilterLabel>
                  <Select
                    value={salesRepFilter}
                    onChange={(value) => {
                      setSalesRepFilter(value);
                      resetToFirstPage();
                    }}
                    options={profiles
                      .filter((item) => ["super_admin", "admin", "sales"].includes(item.role))
                      .map((item) => ({ value: item.id, label: item.full_name || item.email || "" }))}
                    placeholder="All Representatives"
                    allowEmpty
                  />
                </div>
              </div>
            </ComponentCard>
          )}

          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <FormHint>Loading customers...</FormHint>
            </div>
          ) : (
            <>
              <TableViewport>
                  <Table variant="admin" minWidth="wide">
                    <TableHeader variant="admin">
                      <TableRow>
                        {["Customer", "Type", "Contact", "Country", "Price Group", "Sales Rep", "Portal", "Status", ""].map((label) => (
                          <TableCell isHeader
                            key={label || "action"}
                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide"
                          >
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>

                    <TableBody className="divide-y">
                      {customers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="px-4 py-12 text-center text-sm">
                            No customers found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        customers.map((customer) => (
                          <TableRow key={customer.id}>
                            <TableCell className="px-4 py-3">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="font-semibold"
                              >
                                {customer.name}
                              </Link>
                              <p className="mt-0.5 text-xs">{customer.customer_code}</p>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-sm">
                              {customer.customer_type_id ? typeMap.get(customer.customer_type_id) ?? "—" : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <p className="text-sm">{customer.email || "—"}</p>
                              {customer.phone && <p className="mt-0.5 text-xs">{customer.phone}</p>}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-sm">{customer.country_code || "—"}</TableCell>
                            <TableCell className="px-4 py-3 text-sm font-medium">
                              {customer.price_group_id ? groupMap.get(customer.price_group_id) ?? "—" : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-sm">
                              {customer.sales_rep_id ? profileMap.get(customer.sales_rep_id) ?? "—" : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <Badge color={customer.portal_enabled ? "info" : "light"}>
                                {customer.portal_enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <Badge color={statusColor(customer.status)}>
                                {titleCase(customer.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="text-sm font-medium"
                              >
                                Open
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
              </TableViewport>

              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  Showing <span className="font-medium">{startRow}–{endRow}</span> of <span className="font-medium">{filteredCount}</span>
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={String(pageSize)}
                    onChange={(value) => {
                      setPageSize(Number(value));
                      resetToFirstPage();
                    }}
                    options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} / page` }))}
                  />
                  <Button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <span className="flex h-10 min-w-[90px] items-center justify-center px-3 text-xs">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </ComponentCard>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} ariaLabel="New Customer" className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <ComponentCard title="New Customer" desc="Create the customer master record. More details can be added from the customer card.">
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div />
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <Field label="Company / Customer Name" required>
                <Input
                  value={newCustomer.name}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))}
                />
              </Field>
              <Field label="Legal Name">
                <Input
                  value={newCustomer.legal_name}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, legal_name: event.target.value }))}
                />
              </Field>
              <Field label="Customer Type">
                <Select
                  value={newCustomer.customer_type_id}
                  onChange={(value) => setNewCustomer((current) => ({ ...current, customer_type_id: value }))}
                  options={customerTypes.map((item) => ({ value: item.id, label: item.name }))}
                  placeholder="Default (Company)"
                  allowEmpty
                />
              </Field>
              <Field label="Status">
                <Select
                  value={newCustomer.status}
                  onChange={(value) => setNewCustomer((current) => ({ ...current, status: value as CustomerStatus }))}
                  options={CUSTOMER_STATUSES.map((value) => ({ value, label: titleCase(value) }))}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={newCustomer.phone}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))}
                />
              </Field>
              <Field label="Country Code">
                <Input
                  maxLength={2}
                  placeholder="US"
                  value={newCustomer.country_code}
                  onChange={(event) => setNewCustomer((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))}
                />
              </Field>
              <Field label="Price Group">
                <Select
                  value={newCustomer.price_group_id}
                  onChange={(value) => setNewCustomer((current) => ({ ...current, price_group_id: value }))}
                  options={priceGroups.map((item) => ({ value: item.id, label: item.name }))}
                  placeholder="Default (List / Base)"
                  allowEmpty
                />
              </Field>
              <Field label="Sales Representative">
                <Select
                  value={newCustomer.sales_rep_id}
                  onChange={(value) => setNewCustomer((current) => ({ ...current, sales_rep_id: value }))}
                  options={profiles
                    .filter((item) => ["super_admin", "admin", "sales"].includes(item.role))
                    .map((item) => ({ value: item.id, label: item.full_name || item.email || "" }))}
                  placeholder="Unassigned"
                  allowEmpty
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" onClick={() => setCreateOpen(false)} variant="outline">Cancel</Button>
              <Button type="button" onClick={createCustomer} disabled={isSaving}>
                {isSaving ? "Creating..." : "Create Customer"}
              </Button>
            </div>
          </ComponentCard>
      </Modal>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <Label>{children}</Label>;
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
      <Label>
        {label}{required && <span className="ml-1">*</span>}
      </Label>
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
  return (
    <ComponentCard title={label}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xl font-semibold">{value}</p>
        {type !== "default" && <Badge color={type === "brand" ? "info" : type}>{label}</Badge>}
      </div>
    </ComponentCard>
  );
}
