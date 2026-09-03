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
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getCustomerProject,
  updateCustomerProject,
  type CustomerProject,
  type ProjectStatus,
} from "@/lib/customers/project-domain";

type StandaloneOrder = { id: string; order_number: string; status: string; order_date: string; grand_total: number | string };
type ProfileOption = { id: string; full_name: string | null; email: string | null; role: string; is_active: boolean };
type ProjectStatusHistory = {
  id: string;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus;
  note: string | null;
  changed_by: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string | null } | null;
};
type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

const projectStatusOptions: Array<{ value: ProjectStatus; label: string }> = [
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

function badgeColor(status: ProjectStatus): BadgeColor {
  if (status === "completed") return "success";
  if (status === "cancelled") return "error";
  if (status === "in_progress" || status === "ordered") return "info";
  if (status === "approved") return "primary";
  if (status === "quoted") return "warning";
  return "light";
}

function orderBadgeColor(status: string): BadgeColor {
  if (status === "completed" || status === "delivered") return "success";
  if (["confirmed", "in_preparation", "ready_for_shipment"].includes(status)) return "warning";
  if (["shipped", "installation_scheduled", "installation_in_progress"].includes(status)) return "info";
  return "light";
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function displayDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function describeProjectActivity(entry: ProjectStatusHistory) {
  if (!entry.from_status) {
    return `Project created with ${statusLabel(entry.to_status)} status.`;
  }
  return `Project status changed from ${statusLabel(entry.from_status)} to ${statusLabel(entry.to_status)}.`;
}

function projectActivityActor(entry: ProjectStatusHistory) {
  if (!entry.changed_by) return "System";
  return entry.actor?.full_name || entry.actor?.email || "Modulex user";
}

function money(value: string | number, currency: string) {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
  }
}

export default function ProjectDetailWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [standaloneOrders, setStandaloneOrders] = useState<StandaloneOrder[]>([]);
  const [projectActivity, setProjectActivity] = useState<ProjectStatusHistory[]>([]);
  const [projectProfiles, setProjectProfiles] = useState<ProfileOption[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [canManageOrders, setCanManageOrders] = useState(false);
  const [canManageProjects, setCanManageProjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSalesRepId, setEditSalesRepId] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatus>("draft");
  const [editStartDate, setEditStartDate] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");

  const orderOptions = useMemo(
    () => standaloneOrders.map((order) => ({ value: order.id, label: `${order.order_number} — ${statusLabel(order.status)}` })),
    [standaloneOrders]
  );
  const salesRepOptions = useMemo(() => {
    const options = projectProfiles
      .filter((profile) => ["super_admin", "admin", "sales"].includes(profile.role))
      .map((profile) => ({ value: profile.id, label: profile.full_name || profile.email || "Unnamed user" }));
    if (project?.sales_rep_id && !options.some((option) => option.value === project.sales_rep_id)) {
      return [{ value: project.sales_rep_id, label: `${project.sales_rep_name || "Current sales rep"} (current)` }, ...options];
    }
    return options;
  }, [project, projectProfiles]);
  const activeOrders = useMemo(
    () => (project?.orders ?? []).filter((order) => order.status !== "cancelled"),
    [project]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProject = await getCustomerProject(projectId);
      const [{ profile, error: profileError }, ordersResult, activityResult] = await Promise.all([
        getCurrentProfile(),
        supabase
          .from("customer_orders")
          .select("id, order_number, status, order_date, grand_total")
          .eq("customer_id", nextProject.customer_id)
          .is("project_id", null)
          .neq("status", "cancelled")
          .order("order_date", { ascending: false }),
        supabase
          .from("customer_project_status_history")
          .select("id, from_status, to_status, note, changed_by, created_at, actor:profiles!customer_project_status_history_changed_by_fkey(full_name, email)")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (profileError) throw profileError;
      if (ordersResult.error) throw ordersResult.error;
      if (activityResult.error) throw activityResult.error;

      const nextCanManageProjects = Boolean(profile && hasPermission(profile.roles, "projects.manage"));
      let nextProfiles: ProfileOption[] = [];
      if (nextCanManageProjects) {
        const profilesResult = await supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active")
          .eq("is_active", true)
          .order("full_name");
        if (profilesResult.error) throw profilesResult.error;
        nextProfiles = (profilesResult.data ?? []) as ProfileOption[];
      }

      setProject(nextProject);
      setCanManageOrders(Boolean(profile && hasPermission(profile.roles, "orders.manage")));
      setCanManageProjects(nextCanManageProjects);
      setStandaloneOrders((ordersResult.data ?? []) as StandaloneOrder[]);
      setProjectActivity((activityResult.data ?? []) as ProjectStatusHistory[]);
      setProjectProfiles(nextProfiles);
      setEditName(nextProject.name);
      setEditSalesRepId(nextProject.sales_rep_id ?? "");
      setEditStatus(nextProject.status);
      setEditStartDate(dateInputValue(nextProject.start_date));
      setEditTargetDate(dateInputValue(nextProject.target_date));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProject() {
    if (!project || !canManageProjects) return;
    if (!editName.trim()) {
      setError("Project name is required.");
      return;
    }
    setSavingProject(true);
    setError(null);
    setMessage(null);
    try {
      await updateCustomerProject({
        projectId: project.id,
        name: editName,
        salesRepId: editSalesRepId || null,
        projectAddressId: project.project_address_id,
        startDate: editStartDate || null,
        targetDate: editTargetDate || null,
        customerNotes: project.customer_notes,
        internalNotes: project.internal_notes,
        status: editStatus,
      });
      setMessage("Project details saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Project could not be updated.");
    } finally {
      setSavingProject(false);
    }
  }

  async function assignOrder() {
    if (!selectedOrderId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { error: assignError } = await supabase.rpc("assign_customer_order_to_project", {
        p_order_id: selectedOrderId,
        p_project_id: projectId,
      });
      if (assignError) throw assignError;
      setSelectedOrderId("");
      setMessage("Order linked to Project.");
      await load();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Order could not be linked.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !project) {
    return (
      <ComponentCard title="Project" desc="Loading Project details and Orders.">
        <p className="text-sm" role="status">Loading Project…</p>
      </ComponentCard>
    );
  }

  if (!project) {
    return (
      <div className="space-y-3">
        <div role="alert">
          <Alert variant="error" title="Project could not be loaded" message={error || "Project not found."} />
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <div role="alert"><Alert variant="error" title="Project action failed" message={error} /></div> : null}
      {message ? <div role="status"><Alert variant="success" title="Project updated" message={message} /></div> : null}

      <ComponentCard
        title={`${project.project_number} — ${project.name}`}
        desc={project.customer_name}
        headerAction={<Badge color={badgeColor(project.status)}>{statusLabel(project.status)}</Badge>}
      >
        <div className={`grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4 ${ADMIN_TEXT_STYLES.body}`}>
          <p><strong>Sales Rep:</strong> {project.sales_rep_name || "—"}</p>
          <p><strong>Start:</strong> {displayDate(project.start_date)}</p>
          <p><strong>Target:</strong> {displayDate(project.target_date)}</p>
          <p><strong>Orders:</strong> {activeOrders.length}</p>
        </div>
        {project.project_address_snapshot ? (
          <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}><strong>Project site:</strong> {String(project.project_address_snapshot.address_line_1 ?? "")} {String(project.project_address_snapshot.city ?? "")}</p>
        ) : null}
      </ComponentCard>

      {canManageProjects ? (
        <ComponentCard title="Project Settings" desc="Update Project ownership, lifecycle status, and schedule without changing the Customer account.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label htmlFor="project-detail-name">Project name</Label>
              <Input id="project-detail-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="project-detail-sales-rep">Sales Rep</Label>
              <Select id="project-detail-sales-rep" options={salesRepOptions} value={editSalesRepId} onChange={setEditSalesRepId} placeholder="No sales rep" allowEmpty />
            </div>
            <div>
              <Label htmlFor="project-detail-status">Status</Label>
              <Select id="project-detail-status" options={projectStatusOptions} value={editStatus} onChange={(value) => setEditStatus(value as ProjectStatus)} />
            </div>
            <div>
              <Label htmlFor="project-detail-start-date">Start date</Label>
              <Input id="project-detail-start-date" type="date" value={editStartDate} onChange={(event) => setEditStartDate(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="project-detail-target-date">Target date</Label>
              <Input id="project-detail-target-date" type="date" value={editTargetDate} onChange={(event) => setEditTargetDate(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProject} disabled={savingProject || loading}>{savingProject ? "Saving…" : "Save Project"}</Button>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard
        title="Orders"
        desc="Cancelled Orders stay out of the active Project workspace and remain available from the Customer Orders cancelled filter."
        headerAction={canManageOrders ? (
          <Button size="sm" onClick={() => router.push(`/customers/${project.customer_id}/orders/new?projectId=${project.id}`)}>
            New Order
          </Button>
        ) : undefined}
      >
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Order</TableCell>
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Items</TableCell>
                <TableCell isHeader variant="admin">Total</TableCell>
                <TableCell isHeader variant="admin">Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={6}>Refreshing Orders…</TableStateRow> : null}
              {!loading && activeOrders.length === 0 ? <TableStateRow colSpan={6}>No active Orders are linked to this Project yet.</TableStateRow> : null}
              {!loading ? activeOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell variant="admin"><span className="font-medium">{order.order_number}</span></TableCell>
                  <TableCell variant="admin">{displayDate(order.order_date)}</TableCell>
                  <TableCell variant="admin"><Badge color={orderBadgeColor(order.status)}>{statusLabel(order.status)}</Badge></TableCell>
                  <TableCell variant="admin">{order.item_count}</TableCell>
                  <TableCell variant="admin">{money(order.grand_total, order.currency_code)}</TableCell>
                  <TableCell variant="admin">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${project.customer_id}/orders/${order.id}`)}>Open Order</Button>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>

        {canManageOrders ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <Label htmlFor="standalone-order">Link existing customer Order</Label>
              <Select id="standalone-order" options={orderOptions} value={selectedOrderId} onChange={setSelectedOrderId} placeholder="Select standalone Order" allowEmpty />
            </div>
            <Button onClick={assignOrder} disabled={!selectedOrderId || saving}>{saving ? "Linking…" : "Link Order"}</Button>
          </div>
        ) : null}
      </ComponentCard>

      <ComponentCard title="Activity" desc="A readable Project lifecycle timeline, newest first.">
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">When</TableCell>
                <TableCell isHeader variant="admin">Activity</TableCell>
                <TableCell isHeader variant="admin">By</TableCell>
                <TableCell isHeader variant="admin">Note</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={4}>Refreshing Project activity…</TableStateRow> : null}
              {!loading && projectActivity.length === 0 ? <TableStateRow colSpan={4}>No Project lifecycle activity has been recorded yet.</TableStateRow> : null}
              {!loading ? projectActivity.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell variant="admin">{displayDateTime(entry.created_at)}</TableCell>
                  <TableCell variant="admin">
                    <div className="space-y-1">
                      <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{describeProjectActivity(entry)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.from_status ? <Badge color={badgeColor(entry.from_status)}>{statusLabel(entry.from_status)}</Badge> : <Badge color="light">Created</Badge>}
                        <span aria-hidden="true">→</span>
                        <Badge color={badgeColor(entry.to_status)}>{statusLabel(entry.to_status)}</Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell variant="admin">{projectActivityActor(entry)}</TableCell>
                  <TableCell variant="admin">{entry.note || "—"}</TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>
    </div>
  );
}
