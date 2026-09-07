"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import FormHint from "@/components/form/FormHint";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  isValidCountryCode,
  isValidEmail,
  isValidPhone,
  normalizeCountryCode,
  normalizeEmail,
  sanitizePhoneInput,
} from "@/lib/validation";
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
type CustomerDashboardSummary = {
  stats: {
    total_customers: number;
    active_customers: number;
    prospects: number;
    portal_enabled: number;
  };
};
type CreateCustomerResult = {
  customer: Customer;
  price_group_result: "unchanged" | "saved" | "approval_requested";
};
type CreateCustomerFieldErrors = Partial<Record<"name" | "email" | "phone" | "country_code", string>>;

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
  const [createFieldErrors, setCreateFieldErrors] = useState<CreateCustomerFieldErrors>({});

  const typeMap = useMemo(() => new Map(customerTypes.map((item) => [item.id, item.name])), [customerTypes]);
  const groupMap = useMemo(() => new Map(priceGroups.map((item) => [item.id, item.name])), [priceGroups]);
  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.full_name || item.email || "Unknown user"])),
    [profiles]
  );
  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const searchCustomerTypeIds = useMemo(
    () => normalizedSearch ? customerTypes.filter((item) => item.name.toLowerCase().includes(normalizedSearch)).map((item) => item.id) : [],
    [customerTypes, normalizedSearch]
  );
  const searchPriceGroupIds = useMemo(
    () => normalizedSearch ? priceGroups.filter((item) => item.name.toLowerCase().includes(normalizedSearch)).map((item) => item.id) : [],
    [priceGroups, normalizedSearch]
  );
  const searchSalesRepIds = useMemo(
    () => normalizedSearch
      ? profiles
          .filter((item) => `${item.full_name ?? ""} ${item.email ?? ""}`.toLowerCase().includes(normalizedSearch))
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
    if (error) throw error;
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
    const initialStatus = params.get("status");
    const initialPortal = params.get("portal");
    const initialSize = parsePositiveInteger(params.get("size"), 50);
    const initialSearch = params.get("q") ?? "";

    setSearchQuery(initialSearch);
    setDebouncedSearch(initialSearch.trim());
    setStatusFilter(initialStatus && CUSTOMER_STATUSES.includes(initialStatus as CustomerStatus) ? initialStatus as CustomerStatus : "all");
    setTypeFilter(params.get("type") ?? "");
    setPriceGroupFilter(params.get("group") ?? "");
    setCountryFilter(normalizeCountryCode(params.get("country") ?? ""));
    setSalesRepFilter(params.get("rep") ?? "");
    setPortalFilter(initialPortal === "enabled" || initialPortal === "disabled" ? initialPortal : "all");
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
    window.history.replaceState(null, "", `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`);
  }, [urlReady, searchQuery, statusFilter, typeFilter, priceGroupFilter, countryFilter, salesRepFilter, portalFilter, currentPage, pageSize]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    async function initialize() {
      setIsLoading(true);
      setErrorMessage(null);
      const [{ profile, error: profileError }, typesResult, groupsResult, profilesResult] = await Promise.all([
        getCurrentProfile(),
        supabase.from("customer_types").select("id, system_key, name, sort_order, is_active").eq("is_active", true).order("sort_order"),
        supabase
          .from("price_groups")
          .select("id, name, system_key, sort_order, is_base_price, is_active, available_for_orders, requires_approval, internal_only")
          .eq("is_active", true)
          .eq("available_for_orders", true)
          .eq("internal_only", false)
          .order("sort_order"),
        supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active")
          .eq("is_active", true)
          .in("role", ["super_admin", "admin", "sales"])
          .order("full_name"),
      ]);

      const firstError = profileError || typesResult.error || groupsResult.error || profilesResult.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setCanManage(["super_admin", "admin", "sales"].includes(profile?.role ?? ""));
      setCustomerTypes((typesResult.data ?? []) as CustomerType[]);
      setPriceGroups((groupsResult.data ?? []) as PriceGroupLookup[]);
      setProfiles((profilesResult.data ?? []) as ProfileLookup[]);
      try {
        await loadSummary();
      } catch (summaryError) {
        setErrorMessage(summaryError instanceof Error ? summaryError.message : "Customer summary could not be loaded.");
      }
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
        if (searchCustomerTypeIds.length) filters.push(`customer_type_id.in.(${searchCustomerTypeIds.join(",")})`);
        if (searchPriceGroupIds.length) filters.push(`price_group_id.in.(${searchPriceGroupIds.join(",")})`);
        if (searchSalesRepIds.length) filters.push(`sales_rep_id.in.(${searchSalesRepIds.join(",")})`);
        query = query.or(filters.join(","));
      }

      const from = (currentPage - 1) * pageSize;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (cancelled) return;
      if (error) {
        setCustomers([]);
        setFilteredCount(0);
        setErrorMessage(error.message);
      } else {
        setCustomers((data ?? []) as Customer[]);
        setFilteredCount(count ?? 0);
      }
      setIsLoading(false);
    }

    void loadDirectory();
    return () => { cancelled = true; };
  }, [referenceReady, urlReady, refreshToken, currentPage, pageSize, statusFilter, typeFilter, priceGroupFilter, countryFilter, salesRepFilter, portalFilter, normalizedSearch, debouncedSearch, searchCustomerTypeIds, searchPriceGroupIds, searchSalesRepIds]);

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
    setCreateFieldErrors({});
  }

  function clearCreateFieldError(field: keyof CreateCustomerFieldErrors) {
    setCreateFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function focusCreateCustomerError(errors: CreateCustomerFieldErrors) {
    const firstInvalid = (["name", "email", "phone", "country_code"] as const).find((field) => Boolean(errors[field]));
    if (firstInvalid) document.getElementById(`new-customer-${firstInvalid}`)?.focus();
  }

  async function createCustomer() {
    setErrorMessage(null);
    setSuccessMessage(null);

    const errors: CreateCustomerFieldErrors = {};
    if (!newCustomer.name.trim()) errors.name = "Customer name is required.";
    if (!isValidEmail(newCustomer.email)) errors.email = "Enter a valid customer email address.";
    if (!isValidPhone(newCustomer.phone)) errors.phone = "Customer phone must contain 7 to 15 digits and cannot contain letters.";
    if (!isValidCountryCode(newCustomer.country_code)) errors.country_code = "Country code must be a 2-letter ISO code.";
    if (Object.keys(errors).length) {
      setCreateFieldErrors(errors);
      setErrorMessage("Correct the highlighted customer fields.");
      focusCreateCustomerError(errors);
      return;
    }
    setCreateFieldErrors({});

    setIsSaving(true);
    const { data, error } = await supabase.rpc("create_customer", {
      p_name: newCustomer.name.trim(),
      p_legal_name: newCustomer.legal_name.trim() || null,
      p_customer_type_id: newCustomer.customer_type_id || null,
      p_status: newCustomer.status,
      p_email: normalizeEmail(newCustomer.email) || null,
      p_phone: newCustomer.phone.trim() || null,
      p_country_code: normalizeCountryCode(newCustomer.country_code) || null,
      p_price_group_id: newCustomer.price_group_id || null,
      p_sales_rep_id: newCustomer.sales_rep_id || null,
      p_customer_since: new Date().toISOString().slice(0, 10),
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    const result = data as CreateCustomerResult;
    setCreateOpen(false);
    resetNewCustomer();
    try {
      await loadSummary();
    } catch (summaryError) {
      setErrorMessage(summaryError instanceof Error ? summaryError.message : "Customer summary could not be refreshed.");
    }
    resetToFirstPage();
    setRefreshToken((value) => value + 1);
    setSuccessMessage(
      result.price_group_result === "approval_requested"
        ? `Customer ${result.customer.customer_code} created. Price group approval was requested.`
        : `Customer ${result.customer.customer_code} created successfully.`
    );
    setIsSaving(false);
  }

  return (
    <div className="space-y-5">
      {errorMessage ? <Alert variant="error" title="Customer action failed" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Customer updated" message={successMessage} /> : null}

      {!isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="Total Customers" value={summary.total} />
          <SummaryCard label="Active" value={summary.active} />
          <SummaryCard label="Prospects" value={summary.prospects} />
          <SummaryCard label="Portal Enabled" value={summary.portal} />
        </div>
      ) : null}

      <ComponentCard
        title="Customers"
        desc="Customer master data, pricing groups and portal accounts."
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFiltersOpen((current) => !current)}>
              Filters {activeFilterCount > 0 ? <Badge color="info">{activeFilterCount}</Badge> : null}
            </Button>
            {canManage ? <Button onClick={() => setCreateOpen(true)}>New Customer</Button> : null}
          </div>
        }
      >
        {filtersOpen ? (
          <ComponentCard title="Filters" desc="Server-side filters are reflected in the URL so views can be shared or revisited.">
            <div className="flex justify-end">
              {activeFilterCount > 0 ? <Button type="button" variant="outline" onClick={clearFilters}>Clear All</Button> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <div className="xl:col-span-2">
                <FilterLabel>Search</FilterLabel>
                <Input value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); resetToFirstPage(); }} placeholder="Code, company, email, tax number..." />
              </div>
              <div>
                <FilterLabel>Status</FilterLabel>
                <Select value={statusFilter} onChange={(value) => { setStatusFilter(value as "all" | CustomerStatus); resetToFirstPage(); }} options={[{ value: "all", label: "All Statuses" }, ...CUSTOMER_STATUSES.map((value) => ({ value, label: titleCase(value) }))]} />
              </div>
              <div>
                <FilterLabel>Customer Type</FilterLabel>
                <Select value={typeFilter} onChange={(value) => { setTypeFilter(value); resetToFirstPage(); }} options={customerTypes.map((item) => ({ value: item.id, label: item.name }))} placeholder="All Types" allowEmpty />
              </div>
              <div>
                <FilterLabel>Price Group</FilterLabel>
                <Select value={priceGroupFilter} onChange={(value) => { setPriceGroupFilter(value); resetToFirstPage(); }} options={priceGroups.map((item) => ({ value: item.id, label: item.name }))} placeholder="All Groups" allowEmpty />
              </div>
              <div>
                <FilterLabel>Country</FilterLabel>
                <Input value={countryFilter} maxLength={2} placeholder="US" onChange={(event) => { setCountryFilter(normalizeCountryCode(event.target.value)); resetToFirstPage(); }} />
              </div>
              <div>
                <FilterLabel>Portal</FilterLabel>
                <Select value={portalFilter} onChange={(value) => { setPortalFilter(value as PortalFilter); resetToFirstPage(); }} options={[{ value: "all", label: "All" }, { value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }]} />
              </div>
              <div className="xl:col-span-2">
                <FilterLabel>Sales Representative</FilterLabel>
                <Select value={salesRepFilter} onChange={(value) => { setSalesRepFilter(value); resetToFirstPage(); }} options={profiles.map((item) => ({ value: item.id, label: item.full_name || item.email || "" }))} placeholder="All Representatives" allowEmpty />
              </div>
            </div>
          </ComponentCard>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-80 items-center justify-center"><FormHint>Loading customers...</FormHint></div>
        ) : (
          <>
            <TableViewport>
              <Table variant="admin" minWidth="standard">
                <TableHeader variant="admin">
                  <TableRow>
                    {["Customer", "Type", "Contact", "Country", "Price Group", "Sales Rep", "Portal", "Status", ""].map((label) => (
                      <TableCell isHeader variant="admin" key={label || "action"} className="text-left">{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody variant="admin">
                  {customers.length === 0 ? (
                    <TableRow><TableCell variant="admin" colSpan={9}>No customers found.</TableCell></TableRow>
                  ) : customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell variant="admin"><Link href={`/customers/${customer.id}`}>{customer.name}</Link><FormHint>{customer.customer_code}</FormHint></TableCell>
                      <TableCell variant="admin">{customer.customer_type_id ? typeMap.get(customer.customer_type_id) ?? "—" : "—"}</TableCell>
                      <TableCell variant="admin"><span>{customer.email || "—"}</span>{customer.phone ? <FormHint>{customer.phone}</FormHint> : null}</TableCell>
                      <TableCell variant="admin">{customer.country_code || "—"}</TableCell>
                      <TableCell variant="admin">{customer.price_group_id ? groupMap.get(customer.price_group_id) ?? "—" : "—"}</TableCell>
                      <TableCell variant="admin">{customer.sales_rep_id ? profileMap.get(customer.sales_rep_id) ?? "—" : "—"}</TableCell>
                      <TableCell variant="admin"><Badge color={customer.portal_enabled ? "info" : "light"}>{customer.portal_enabled ? "Enabled" : "Disabled"}</Badge></TableCell>
                      <TableCell variant="admin"><Badge color={statusColor(customer.status)}>{titleCase(customer.status)}</Badge></TableCell>
                      <TableCell variant="admin"><Link href={`/customers/${customer.id}`}>Open</Link></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableViewport>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FormHint>Showing {startRow}–{endRow} of {filteredCount}</FormHint>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-36"><Select value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); resetToFirstPage(); }} options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} / page` }))} /></div>
                <Button type="button" variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
                <FormHint>{currentPage} / {totalPages}</FormHint>
                <Button type="button" variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button>
              </div>
            </div>
          </>
        )}
      </ComponentCard>

      <Modal isOpen={createOpen} onClose={() => { if (!isSaving) setCreateOpen(false); }} ariaLabel="New Customer" className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <ComponentCard title="New Customer" desc="Create the customer master record. More details can be added from the customer card.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company / Customer Name" required><Input id="new-customer-name" value={newCustomer.name} error={Boolean(createFieldErrors.name)} hint={createFieldErrors.name} onChange={(event) => { clearCreateFieldError("name"); setNewCustomer((current) => ({ ...current, name: event.target.value })); }} /></Field>
            <Field label="Legal Name"><Input value={newCustomer.legal_name} onChange={(event) => setNewCustomer((current) => ({ ...current, legal_name: event.target.value }))} /></Field>
            <Field label="Customer Type"><Select value={newCustomer.customer_type_id} onChange={(value) => setNewCustomer((current) => ({ ...current, customer_type_id: value }))} options={customerTypes.map((item) => ({ value: item.id, label: item.name }))} placeholder="Default (Company)" allowEmpty /></Field>
            <Field label="Status"><Select value={newCustomer.status} onChange={(value) => setNewCustomer((current) => ({ ...current, status: value as CustomerStatus }))} options={CUSTOMER_STATUSES.map((value) => ({ value, label: titleCase(value) }))} /></Field>
            <Field label="Email"><Input id="new-customer-email" type="email" value={newCustomer.email} error={Boolean(createFieldErrors.email)} hint={createFieldErrors.email} onChange={(event) => { clearCreateFieldError("email"); setNewCustomer((current) => ({ ...current, email: event.target.value })); }} /></Field>
            <Field label="Phone"><Input id="new-customer-phone" type="tel" inputMode="tel" maxLength={24} value={newCustomer.phone} error={Boolean(createFieldErrors.phone)} hint={createFieldErrors.phone} onChange={(event) => { clearCreateFieldError("phone"); setNewCustomer((current) => ({ ...current, phone: sanitizePhoneInput(event.target.value) })); }} placeholder="+1 (202) 555-0123" /></Field>
            <Field label="Country Code"><Input id="new-customer-country_code" maxLength={2} placeholder="US" value={newCustomer.country_code} error={Boolean(createFieldErrors.country_code)} hint={createFieldErrors.country_code} onChange={(event) => { clearCreateFieldError("country_code"); setNewCustomer((current) => ({ ...current, country_code: normalizeCountryCode(event.target.value) })); }} /></Field>
            <Field label="Price Group"><Select value={newCustomer.price_group_id} onChange={(value) => setNewCustomer((current) => ({ ...current, price_group_id: value }))} options={priceGroups.map((item) => ({ value: item.id, label: `${item.name}${item.requires_approval ? " · Approval" : ""}` }))} placeholder="Default (List / Base)" allowEmpty /></Field>
            <Field label="Sales Representative"><Select value={newCustomer.sales_rep_id} onChange={(value) => setNewCustomer((current) => ({ ...current, sales_rep_id: value }))} options={profiles.map((item) => ({ value: item.id, label: item.full_name || item.email || "" }))} placeholder="Unassigned" allowEmpty /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" disabled={isSaving || !newCustomer.name.trim()} onClick={() => void createCustomer()}>{isSaving ? "Creating..." : "Create Customer"}</Button>
          </div>
        </ComponentCard>
      </Modal>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <Label>{children}</Label>;
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><Label>{label}{required ? " *" : ""}</Label>{children}</div>;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <ComponentCard title={label}><span>{value}</span></ComponentCard>;
}
