"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";
import { getCustomerProject, type CustomerProject, type ProjectStatus } from "@/lib/customers/project-domain";

type StandaloneOrder = { id: string; order_number: string; status: string; order_date: string; grand_total: number | string };

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

  const load = useCallback(async () => {
    const nextProject = await getCustomerProject(projectId);
    setProject(nextProject);
    const [{ profile, error: profileError }, ordersResult] = await Promise.all([
      getCurrentProfile(),
      supabase
        .from("customer_orders")
        .select("id, order_number, status, order_date, grand_total")
        .eq("customer_id", nextProject.customer_id)
        .is("project_id", null)
        .order("order_date", { ascending: false }),
    ]);
    if (profileError) throw profileError;
    if (ordersResult.error) throw ordersResult.error;
    setCanManageOrders(Boolean(profile && hasPermission(profile.role, "orders.manage")));
    setStandaloneOrders((ordersResult.data ?? []) as StandaloneOrder[]);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Project could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
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

  if (loading) return <p className="text-sm">Loading Project…</p>;
  if (!project) return <p role="alert" className="text-sm">{error || "Project not found."}</p>;

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}

      <ComponentCard
        title={`${project.project_number} — ${project.name}`}
        desc={project.customer_name}
        headerAction={<Badge color={badgeColor(project.status)}>{statusLabel(project.status)}</Badge>}
      >
        <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
          <p><strong>Sales Rep:</strong> {project.sales_rep_name || "—"}</p>
          <p><strong>Start:</strong> {project.start_date || "—"}</p>
          <p><strong>Target:</strong> {project.target_date || "—"}</p>
          <p><strong>Orders:</strong> {project.orders?.length ?? 0}</p>
        </div>
        {project.project_address_snapshot ? (
          <p className="text-sm"><strong>Project site:</strong> {String(project.project_address_snapshot.address_line_1 ?? "")} {String(project.project_address_snapshot.city ?? "")}</p>
        ) : null}
      </ComponentCard>

      <ComponentCard title="Orders" desc="Existing Orders remain canonical; Project only groups them at the Job level.">
        {project.orders?.length ? (
          <div className="space-y-3">
            {project.orders.map((order) => (
              <div key={order.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <p><strong>{order.order_number}</strong> — {statusLabel(order.status)}</p>
                  <p>{order.order_date} · {order.item_count} item(s) · {order.currency_code} {Number(order.grand_total).toFixed(2)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${project.customer_id}/orders/${order.id}`)}>Open Order</Button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm">No Orders are linked to this Project yet.</p>}

        {canManageOrders ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <Label htmlFor="standalone-order">Link existing customer Order</Label>
              <Select id="standalone-order" options={orderOptions} value={selectedOrderId} onChange={setSelectedOrderId} placeholder="Select standalone Order" allowEmpty />
            </div>
            <Button onClick={assignOrder} disabled={!selectedOrderId || saving}>{saving ? "Linking…" : "Link Order"}</Button>
          </div>
        ) : null}
      </ComponentCard>

      <ComponentCard title="Next upgrades" desc="These are intentionally not blockers for the Project foundation merge.">
        <p className="text-sm">Financials, Payments, Change Orders, Delivery/Installation rollups, People and Commissions will be added as Project upgrades after the core Project↔Order foundation is accepted.</p>
      </ComponentCard>
    </div>
  );
}
