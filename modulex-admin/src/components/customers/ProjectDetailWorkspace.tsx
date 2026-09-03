"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
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
import { getCustomerProject, type CustomerProject, type ProjectStatus } from "@/lib/customers/project-domain";

type StandaloneOrder = { id: string; order_number: string; status: string; order_date: string; grand_total: number | string };
type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

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
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [canManageOrders, setCanManageOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const orderOptions = useMemo(
    () => standaloneOrders.map((order) => ({ value: order.id, label: `${order.order_number} — ${statusLabel(order.status)}` })),
    [standaloneOrders]
  );
  const activeOrders = useMemo(
    () => (project?.orders ?? []).filter((order) => order.status !== "cancelled"),
    [project]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProject = await getCustomerProject(projectId);
      const [{ profile, error: profileError }, ordersResult] = await Promise.all([
        getCurrentProfile(),
        supabase
          .from("customer_orders")
          .select("id, order_number, status, order_date, grand_total")
          .eq("customer_id", nextProject.customer_id)
          .is("project_id", null)
          .neq("status", "cancelled")
          .order("order_date", { ascending: false }),
      ]);
      if (profileError) throw profileError;
      if (ordersResult.error) throw ordersResult.error;
      setProject(nextProject);
      setCanManageOrders(Boolean(profile && hasPermission(profile.role, "orders.manage")));
      setStandaloneOrders((ordersResult.data ?? []) as StandaloneOrder[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
          <p><strong>Sales Rep:</strong> {project.sales_rep_name || "—"}</p>
          <p><strong>Start:</strong> {displayDate(project.start_date)}</p>
          <p><strong>Target:</strong> {displayDate(project.target_date)}</p>
          <p><strong>Orders:</strong> {activeOrders.length}</p>
        </div>
        {project.project_address_snapshot ? (
          <p className="text-sm"><strong>Project site:</strong> {String(project.project_address_snapshot.address_line_1 ?? "")} {String(project.project_address_snapshot.city ?? "")}</p>
        ) : null}
      </ComponentCard>

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
    </div>
  );
}
