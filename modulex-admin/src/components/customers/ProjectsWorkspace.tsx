"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import {
  createCustomerProject,
  listCustomerProjects,
  type CustomerProject,
  type ProjectStatus,
} from "@/lib/customers/project-domain";

type CustomerOption = { id: string; name: string; sales_rep_id: string | null };
type ProfileOption = { id: string; full_name: string | null; email: string | null; role: string; is_active: boolean };

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

export default function ProjectsWorkspace() {
  const router = useRouter();
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ProjectStatus>("all");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const customerOptions = useMemo(() => customers.map((item) => ({ value: item.id, label: item.name })), [customers]);
  const salesRepOptions = useMemo(
    () => profiles.filter((item) => ["super_admin", "admin", "sales"].includes(item.role)).map((item) => ({ value: item.id, label: item.full_name || item.email || "Unnamed user" })),
    [profiles]
  );

  const loadReferenceData = useCallback(async () => {
    const [customersResult, profilesResult] = await Promise.all([
      supabase.from("customers").select("id, name, sales_rep_id").order("name"),
      supabase.from("profiles").select("id, full_name, email, role, is_active").eq("is_active", true).order("full_name"),
    ]);
    const firstError = customersResult.error || profilesResult.error;
    if (firstError) throw firstError;
    setCustomers((customersResult.data ?? []) as CustomerOption[]);
    setProfiles((profilesResult.data ?? []) as ProfileOption[]);
  }, []);

  const loadProjects = useCallback(async () => {
    const result = await listCustomerProjects({
      search: search || null,
      status: status === "all" ? null : status,
      limit: 50,
      offset: 0,
    });
    setProjects(result.items);
  }, [search, status]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([loadReferenceData(), loadProjects()])
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Projects could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadProjects, loadReferenceData]);

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customers.find((item) => item.id === nextCustomerId);
    setSalesRepId(customer?.sales_rep_id ?? "");
  }

  async function handleCreate() {
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
      await loadProjects();
      router.push(`/projects/${projectId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Project could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <ComponentCard title="Create Project" desc="Create the Job container first; Orders can then be created inside it.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="project-customer">Customer</Label>
            <Select id="project-customer" options={customerOptions} value={customerId} onChange={handleCustomerChange} placeholder="Select customer" />
          </div>
          <div>
            <Label htmlFor="project-name">Project name</Label>
            <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Kitchen Remodel" />
          </div>
          <div>
            <Label htmlFor="project-sales-rep">Sales Rep</Label>
            <Select id="project-sales-rep" options={salesRepOptions} value={salesRepId} onChange={setSalesRepId} placeholder="Select sales rep" allowEmpty />
          </div>
          <div>
            <Label htmlFor="project-target-date">Target date</Label>
            <Input id="project-target-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </div>
        </div>
        {error ? <p role="alert" className="text-sm">{error}</p> : null}
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create Project"}</Button>
        </div>
      </ComponentCard>

      <ComponentCard title="Projects" desc="Project ownership is separate from who created an Order.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="project-search">Search</Label>
            <Input id="project-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Project #, customer or project name" />
          </div>
          <div>
            <Label htmlFor="project-status">Status</Label>
            <Select id="project-status" options={statusOptions} value={status} onChange={(value) => setStatus(value as "all" | ProjectStatus)} allowEmpty />
          </div>
        </div>

        {loading ? <p className="text-sm">Loading projects…</p> : null}
        {!loading && projects.length === 0 ? <p className="text-sm">No projects match the current filters.</p> : null}
        <div className="space-y-4">
          {projects.map((project) => (
            <ComponentCard
              key={project.id}
              title={`${project.project_number} — ${project.name}`}
              desc={project.customer_name}
              headerAction={<Badge color={badgeColor(project.status)}>{statusLabel(project.status)}</Badge>}
            >
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <p><strong>Sales Rep:</strong> {project.sales_rep_name || "—"}</p>
                <p><strong>Target:</strong> {project.target_date || "—"}</p>
                <p><strong>Updated:</strong> {new Date(project.updated_at).toLocaleDateString()}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => router.push(`/projects/${project.id}`)}>Open Project</Button>
              </div>
            </ComponentCard>
          ))}
        </div>
      </ComponentCard>
    </div>
  );
}
