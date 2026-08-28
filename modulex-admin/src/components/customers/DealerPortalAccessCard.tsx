"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { CustomerPortalUser } from "@/lib/customers/types";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const primaryButtonClass = "inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const dangerButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-medium text-error-700 transition hover:bg-error-100 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function DealerPortalAccessCard({ customerId }: { customerId: string }) {
  const [canManage, setCanManage] = useState(false);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [users, setUsers] = useState<CustomerPortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", login_email: "", portal_role: "buyer" as "admin" | "buyer" | "viewer", is_primary: false });

  async function load() {
    const [{ profile }, customerResult, usersResult] = await Promise.all([
      getCurrentProfile(),
      supabase.from("customers").select("portal_enabled").eq("id", customerId).single(),
      supabase.from("customer_portal_users").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("created_at"),
    ]);
    setCanManage(["super_admin", "admin"].includes(profile?.role ?? ""));
    setPortalEnabled(Boolean(customerResult.data?.portal_enabled));
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
    if (!response.ok) throw new Error(payload.error || "Dealer portal action failed.");
  }

  async function createUser() {
    if (!form.login_email.trim()) return setError("Login email is required.");
    setBusyId("create");
    try {
      await apiRequest("POST", { customer_id: customerId, ...form });
      setForm({ full_name: "", login_email: "", portal_role: "buyer", is_primary: false });
      await load();
      setMessage("Dealer portal user created as Never Invited.");
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
      setError(err instanceof Error ? err.message : "Dealer portal action failed.");
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
    <section className="rounded-2xl border border-brand-200 bg-white p-5 shadow-theme-xs dark:border-brand-500/30 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Secure lifecycle</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">Dealer Portal Access</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Invitation, activation and suspension are controlled by the Admin server. Status cannot be promoted manually.</p>
        </div>
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => void action(portalEnabled ? "disable_portal" : "enable_portal")}
          className={portalEnabled ? dangerButtonClass : primaryButtonClass}
        >
          {portalEnabled ? "Disable Portal" : "Enable Portal"}
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700">{error}</div>}
      {message && <div className="mt-4 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700">{message}</div>}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {users.map((user) => (
          <div key={user.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-gray-800 dark:text-white/90">{user.full_name || user.login_email}</h3>
                  {user.is_primary && <span className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-700">Primary</span>}
                </div>
                <p className="mt-1 text-sm text-gray-500">{user.login_email}</p>
                <p className="mt-2 text-xs text-gray-400">{titleCase(user.portal_role)} · {titleCase(user.status)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {user.status === "never_invited" && <button className={primaryButtonClass} disabled={!portalEnabled || busyId !== null} onClick={() => void action("invite", user.id)}>Invite</button>}
                {user.status === "invited" && <button className={secondaryButtonClass} disabled={!portalEnabled || busyId !== null} onClick={() => void action("resend_invite", user.id)}>Resend Invite</button>}
                {user.status !== "suspended" && user.status !== "never_invited" && <button className={dangerButtonClass} disabled={busyId !== null} onClick={() => void action("suspend", user.id)}>Suspend</button>}
                {user.status === "suspended" && <button className={secondaryButtonClass} disabled={busyId !== null} onClick={() => void action("restore", user.id)}>Restore</button>}
                {!user.is_primary && <button className={secondaryButtonClass} disabled={busyId !== null} onClick={() => void action("set_primary", user.id)}>Set Primary</button>}
                {user.status === "never_invited" && !user.auth_user_id && <button className={dangerButtonClass} disabled={busyId !== null} onClick={() => void removeDraft(user.id)}>Remove Draft</button>}
              </div>
            </div>
          </div>
        ))}
        {!users.length && <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700">No dealer portal users yet.</div>}
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Create Portal User</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Full Name<input className={`${inputClass} mt-1`} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Login Email<input className={`${inputClass} mt-1`} type="email" value={form.login_email} onChange={(event) => setForm({ ...form, login_email: event.target.value })} /></label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Portal Role<select className={`${inputClass} mt-1`} value={form.portal_role} onChange={(event) => setForm({ ...form, portal_role: event.target.value as "admin" | "buyer" | "viewer" })}><option value="admin">Admin</option><option value="buyer">Buyer</option><option value="viewer">Viewer</option></select></label>
          <label className="flex items-center gap-2 pt-6 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={form.is_primary} onChange={(event) => setForm({ ...form, is_primary: event.target.checked })} />Primary portal user</label>
        </div>
        <div className="mt-4 flex justify-end"><button type="button" className={primaryButtonClass} disabled={busyId !== null} onClick={() => void createUser()}>{busyId === "create" ? "Creating…" : "Create Portal User"}</button></div>
      </div>
    </section>
  );
}
