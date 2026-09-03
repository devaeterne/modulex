"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { loadCustomerRecord } from "@/lib/customers/read-dedup";
import type { CustomerPortalUser } from "@/lib/customers/types";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CustomerPortalAccessCard({ customerId }: { customerId: string }) {
  const [canManage, setCanManage] = useState(false);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [users, setUsers] = useState<CustomerPortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", login_email: "", portal_role: "buyer" as "admin" | "buyer" | "viewer", is_primary: false });

  async function load() {
    const [{ profile }, customer, usersResult] = await Promise.all([
      getCurrentProfile(),
      loadCustomerRecord(customerId),
      supabase.from("customer_portal_users").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("created_at"),
    ]);
    setCanManage(["super_admin", "admin"].includes(profile?.role ?? ""));
    setPortalEnabled(Boolean(customer.portal_enabled));
    setUsers((usersResult.data ?? []) as CustomerPortalUser[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [customerId]);

  async function apiRequest(method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, query?: string) {
    setError(null);
    setMessage(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your Admin session has expired.");

    const response = await fetch(`/api/admin/dealer-portal${query || ""}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Store portal action failed.");
  }

  async function createUser() {
    if (!form.login_email.trim()) return setError("Login email is required.");
    setBusyId("create");
    try {
      await apiRequest("POST", { customer_id: customerId, ...form });
      setForm({ full_name: "", login_email: "", portal_role: "buyer", is_primary: false });
      await load();
      setMessage("Portal user created as Never Invited.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create portal user.");
    } finally {
      setBusyId(null);
    }
  }

  async function action(actionName: string, portalUserId?: string) {
    setBusyId(portalUserId || actionName);
    try {
      await apiRequest("PATCH", { action: actionName, customer_id: customerId, ...(portalUserId ? { portal_user_id: portalUserId } : {}) });
      await load();
      setMessage(actionName.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase()) + " completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Store portal action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeDraft(portalUserId: string) {
    if (!confirm("Remove this never-invited portal user?")) return;
    setBusyId(portalUserId);
    try {
      await apiRequest("DELETE", undefined, `?customer_id=${encodeURIComponent(customerId)}&portal_user_id=${encodeURIComponent(portalUserId)}`);
      await load();
      setMessage("Portal user draft removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove portal user.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !canManage) return null;

  return (
    <ComponentCard
      title="Store Portal Access"
      desc="Invitation, activation and suspension are controlled by the Admin server. Status cannot be promoted manually."
      headerAction={<Button
          variant={portalEnabled ? "danger" : "primary"}
          size="sm"
          disabled={busyId !== null}
          onClick={() => void action(portalEnabled ? "disable_portal" : "enable_portal")}
        >
          {portalEnabled ? "Disable Portal" : "Enable Portal"}
        </Button>}
    >
      <span className="sr-only">Store Portal Access</span>
      {error ? <Alert variant="error" title="Portal action failed" message={error} /> : null}
      {message ? <Alert variant="success" title="Portal updated" message={message} /> : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {users.map((user) => (
          <ComponentCard key={user.id} title={user.full_name || user.login_email} desc={`${user.login_email} · ${titleCase(user.portal_role)} · ${titleCase(user.status)}`} headerAction={user.is_primary ? <Badge color="primary">Primary</Badge> : undefined}>
            <div className="flex flex-wrap justify-end gap-2">
              {user.status === "never_invited" ? <Button size="sm" disabled={!portalEnabled || busyId !== null} onClick={() => void action("invite", user.id)}>Invite</Button> : null}
              {user.status === "invited" ? <Button size="sm" variant="outline" disabled={!portalEnabled || busyId !== null} onClick={() => void action("resend_invite", user.id)}>Resend Invite</Button> : null}
              {user.status !== "suspended" && user.status !== "never_invited" ? <Button size="sm" variant="danger" disabled={busyId !== null} onClick={() => void action("suspend", user.id)}>Suspend</Button> : null}
              {user.status === "suspended" ? <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void action("restore", user.id)}>Restore</Button> : null}
              {!user.is_primary ? <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void action("set_primary", user.id)}>Set Primary</Button> : null}
              {user.status === "never_invited" && !user.auth_user_id ? <Button size="sm" variant="danger" disabled={busyId !== null} onClick={() => void removeDraft(user.id)}>Remove Draft</Button> : null}
            </div>
          </ComponentCard>
        ))}
        {!users.length ? <Alert variant="info" title="No portal users" message="No dealer portal users yet." /> : null}
      </div>

      <ComponentCard title="Create Portal User">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div><Label>Full Name</Label><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></div>
          <div><Label>Login Email</Label><Input type="email" value={form.login_email} onChange={(event) => setForm({ ...form, login_email: event.target.value })} /></div>
          <div><Label>Portal Role</Label><Select options={[{ value: "admin", label: "Admin" }, { value: "buyer", label: "Buyer" }, { value: "viewer", label: "Viewer" }]} value={form.portal_role} onChange={(value) => setForm({ ...form, portal_role: value as "admin" | "buyer" | "viewer" })} /></div>
          <div className="pt-6"><Checkbox label="Primary portal user" checked={form.is_primary} onChange={(is_primary) => setForm({ ...form, is_primary })} /></div>
        </div>
        <div className="mt-4 flex justify-end"><Button disabled={busyId !== null} onClick={() => void createUser()}>{busyId === "create" ? "Creating…" : "Create Portal User"}</Button></div>
      </ComponentCard>
    </ComponentCard>
  );
}
