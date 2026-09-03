"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import SearchableSelect from "@/components/form/SearchableSelect";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createCustomerProject,
  listCustomerProjects,
  type CustomerProject,
  type ProjectStatus,
} from "@/lib/customers/project-domain";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type CustomerOption = { id: string; name: string; sales_rep_id: string | null };
type ProfileOption = { id: string; full_name: string | null; email: string | null; role: string; is_active: boolean };
type ProjectReferenceData = { customers: CustomerOption[]; profiles: ProfileOption[] };

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const REFERENCE_RESULT_LIMIT = 50;

const statusOptions: Array<{ value: "all" | ProjectStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "quoted", label: "Quoted" },
  { value: "approved", label: "Approved" },
  { value: "ordered", label: "Ordered" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const pageSizeOptions = PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} / page` }));

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function badgeColor(status: ProjectStatus): "primary" | "success" | "warning" | "error" | "info" | "light" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "error";
  if (status === "in_progress" || status === "ordered") return "info";
  if (status === "approved") return "primary";
  if (status === "quoted") return "warning";
  return "light";
}

function displayDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function mergeSelectedRows<T extends { id: string }>(nextRows: T[], previousRows: T[], selectedIds: string[]) {
  const nextIds = new Set(nextRows.map((row) => row.id));
  const selected = new Set(selectedIds.filter(Boolean));
  const preserved = previousRows.filter((row) => selected.has(row.id) && !nextIds.has(row.id));
  return [...preserved, ...nextRows];
}

export default function ProjectsWorkspace() {
  const router = useRouter();
  const reloadRequestId = useRef(0);
  const customerOptionRequestId = useRef(0);
  const profileOptionRequestId = useRef(0);
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [canManageProjects, setCanManageProjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerOptionsLoading, setCustomerOptionsLoading] = useState(false);
  const [profileOptionsLoading, setProfileOptionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ProjectStatus>("all");
  const [customerFilterId, setCustomerFilterId] = useState("");
  const [salesRepFilterId, setSalesRepFilterId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const customerOptions = useMemo(() => customers.map((item) => ({ value: item.id, label: item.name })), [customers]);
  const salesRepOptions = useMemo(
    () => profiles.map((item) => ({ value: item.id, label: item.full_name || item.email || "Unnamed user" })),
    [profiles]
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startRow = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  const loadCustomerOptions = useCallback(async (queryText = "") => {
    let query = supabase
      .from("customers")
      .select("id, name, sales_rep_id")
      .order("name")
      .limit(REFERENCE_RESULT_LIMIT);
    const normalized = queryText.trim();
    if (normalized) query = query.ilike("name", `%${normalized}%`);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data ?? []) as CustomerOption[];
  }, []);

  const loadSalesRepOptions = useCallback(async (queryText = "") => {
    let query = supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("is_active", true)
      .in("role", ["super_admin", "admin", "sales"])
      .order("full_name")
      .limit(REFERENCE_RESULT_LIMIT);
    const normalized = queryText.trim();
    if (normalized) query = query.ilike("full_name", `%${normalized}%`);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data ?? []) as ProfileOption[];
  }, []);

  const loadReferenceData = useCallback(async (): Promise<ProjectReferenceData> => {
    const [nextCustomers, nextProfiles] = await Promise.all([
      loadCustomerOptions(),
      loadSalesRepOptions(),
    ]);
    return { customers: nextCustomers, profiles: nextProfiles };
  }, [loadCustomerOptions, loadSalesRepOptions]);

  const loadProjects = useCallback(() => listCustomerProjects({
    search: search || null,
    status: status === "all" ? null : status,
    customerId: customerFilterId || null,
    salesRepId: salesRepFilterId || null,
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  }), [currentPage, customerFilterId, pageSize, salesRepFilterId, search, status]);

  const reload = useCallback(async () => {
    const requestId = ++reloadRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const { profile, error: profileError } = await getCurrentProfile();
      if (requestId !== reloadRequestId.current) return;
      if (profileError) throw profileError;

      const [projectResult, referenceData] = await Promise.all([
        loadProjects(),
        loadReferenceData(),
      ]);
      if (requestId !== reloadRequestId.current) return;

      setCanManageProjects(Boolean(profile && hasPermission(profile.roles, "projects.manage")));
      setProjects(projectResult.items);
      setTotalCount(projectResult.total_count);
      setCustomers(referenceData.customers);
      setProfiles(referenceData.profiles);
    } catch (loadError) {
      if (requestId !== reloadRequestId.current) return;
      setError(loadError instanceof Error ? loadError.message : "Projects could not be loaded.");
    } finally {
      if (requestId === reloadRequestId.current) setLoading(false);
    }
  }, [loadProjects, loadReferenceData]);

  const searchCustomers = useCallback(async (queryText: string) => {
    const requestId = ++customerOptionRequestId.current;
    setCustomerOptionsLoading(true);
    try {
      const nextRows = await loadCustomerOptions(queryText);
      if (requestId !== customerOptionRequestId.current) return;
      setCustomers((previousRows) => mergeSelectedRows(nextRows, previousRows, [customerId, customerFilterId]));
    } catch (searchError) {
      if (requestId === customerOptionRequestId.current) {
        setError(searchError instanceof Error ? searchError.message : "Customer options could not be loaded.");
      }
    } finally {
      if (requestId === customerOptionRequestId.current) setCustomerOptionsLoading(false);
    }
  }, [customerFilterId, customerId, loadCustomerOptions]);

  const searchSalesReps = useCallback(async (queryText: string) => {
    const requestId = ++profileOptionRequestId.current;
    setProfileOptionsLoading(true);
    try {
      const nextRows = await loadSalesRepOptions(queryText);
      if (requestId !== profileOptionRequestId.current) return;
      setProfiles((previousRows) => mergeSelectedRows(nextRows, previousRows, [salesRepId, salesRepFilterId]));
    } catch (searchError) {
      if (requestId === profileOptionRequestId.current) {
        setError(searchError instanceof Error ? searchError.message : "Sales Rep options could not be loaded.");
      }
    } finally {
      if (requestId === profileOptionRequestId.current) setProfileOptionsLoading(false);
    }
  }, [loadSalesRepOptions, salesRepFilterId, salesRepId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customers.find((item) => item.id === nextCustomerId);
    setSalesRepId(customer?.sales_rep_id ?? "");
  }

  async function handleCreate() {
    if (!canManageProjects) {
      setError("You do not have permission to create projects.");
      return;
    }
    if (!customerId || !name.trim()) {
      setError("Customer and Project name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const projectId = await createCustomerProject({
        customerId,
        name,
        salesRepId: salesRepId || null,
        targetDate: targetDate || null,
        status: "draft",
      });
      setName("");
      setTargetDate("");
      setMessage("Project created.");
      router.push(`/projects/${projectId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Project could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div role="alert" className="space-y-3">
          <Alert variant="error" title="Project action failed" message={error} />
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>Retry</Button>
        </div>
      ) : null}
      {message ? (
        <div role="status">
          <Alert variant="success" title="Project updated" message={message} />
        </div>
      ) : null}

      {canManageProjects ? (
        <ComponentCard title="Create Project" desc="Create the Job container first; Orders can then be created inside it.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Label htmlFor="project-customer">Customer</Label>
              <SearchableSelect
                options={customerOptions}
                value={customerId}
                onChange={handleCustomerChange}
                onSearchChange={searchCustomers}
                loading={customerOptionsLoading}
                placeholder="Select customer"
                searchPlaceholder="Search customers by name"
                noResultsText="No matching customers."
                required
              />
            </div>
            <div>
              <Label htmlFor="project-name">Project name</Label>
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Kitchen Remodel" />
            </div>
            <div>
              <Label htmlFor="project-sales-rep">Sales Rep</Label>
              <SearchableSelect
                options={salesRepOptions}
                value={salesRepId}
                onChange={setSalesRepId}
                onSearchChange={searchSalesReps}
                loading={profileOptionsLoading}
                placeholder="Select sales rep"
                searchPlaceholder="Search sales reps by name"
                noResultsText="No matching Sales Reps."
                allowEmpty
              />
            </div>
            <div>
              <Label htmlFor="project-target-date">Target date</Label>
              <Input id="project-target-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create Project"}</Button>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Projects" desc="Project ownership is separate from who created an Order.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_180px_140px]">
          <div>
            <Label htmlFor="project-search">Search</Label>
            <Input
              id="project-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Project #, customer or project name"
            />
          </div>
          <div>
            <Label>Customer</Label>
            <SearchableSelect
              options={customerOptions}
              value={customerFilterId}
              onChange={(value) => {
                setCustomerFilterId(value);
                setCurrentPage(1);
              }}
              onSearchChange={searchCustomers}
              loading={customerOptionsLoading}
              placeholder="All customers"
              searchPlaceholder="Search customers by name"
              noResultsText="No matching customers."
              allowEmpty
              ariaLabel="Filter Projects by Customer"
            />
          </div>
          <div>
            <Label>Sales Rep</Label>
            <SearchableSelect
              options={salesRepOptions}
              value={salesRepFilterId}
              onChange={(value) => {
                setSalesRepFilterId(value);
                setCurrentPage(1);
              }}
              onSearchChange={searchSalesReps}
              loading={profileOptionsLoading}
              placeholder="All sales reps"
              searchPlaceholder="Search sales reps by name"
              noResultsText="No matching Sales Reps."
              allowEmpty
              ariaLabel="Filter Projects by Sales Rep"
            />
          </div>
          <div>
            <Label htmlFor="project-status">Status</Label>
            <Select
              id="project-status"
              options={statusOptions}
              value={status}
              onChange={(value) => {
                setStatus(value as "all" | ProjectStatus);
                setCurrentPage(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="project-page-size">Rows</Label>
            <Select
              id="project-page-size"
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
                <TableCell isHeader variant="admin">Project</TableCell>
                <TableCell isHeader variant="admin">Customer</TableCell>
                <TableCell isHeader variant="admin">Sales Rep</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Target</TableCell>
                <TableCell isHeader variant="admin">Updated</TableCell>
                <TableCell isHeader variant="admin">Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={7}>Loading projects…</TableStateRow> : null}
              {!loading && projects.length === 0 ? <TableStateRow colSpan={7}>No projects match the current filters.</TableStateRow> : null}
              {!loading ? projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell variant="admin">
                    <div className="font-medium">{project.project_number}</div>
                    <div className="text-sm">{project.name}</div>
                  </TableCell>
                  <TableCell variant="admin">{project.customer_name}</TableCell>
                  <TableCell variant="admin">{project.sales_rep_name || "—"}</TableCell>
                  <TableCell variant="admin"><Badge color={badgeColor(project.status)}>{statusLabel(project.status)}</Badge></TableCell>
                  <TableCell variant="admin">{displayDate(project.target_date)}</TableCell>
                  <TableCell variant="admin">{displayDate(project.updated_at)}</TableCell>
                  <TableCell variant="admin">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${project.id}`)}>Open</Button>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>

        <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${ADMIN_TEXT_STYLES.body}`}>
          <p className="text-sm" aria-live="polite">
            {totalCount === 0 ? "0 projects" : `${startRow}–${endRow} of ${totalCount} projects`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <span className="min-w-[72px] text-center text-sm">{currentPage} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages || loading} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
