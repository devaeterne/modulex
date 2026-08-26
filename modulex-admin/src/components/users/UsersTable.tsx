"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/profile";
import { ROLE_LABELS } from "@/lib/auth/permissions";

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
};

type Actor = { id: string; role: UserRole };
type ModalMode = "create" | "edit" | "password" | null;

const roles: UserRole[] = ["super_admin", "admin", "sales", "warehouse", "shipping"];
const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonPrimary = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50";
const buttonSecondary = "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function UsersTable() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("warehouse");
  const [createMode, setCreateMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");

    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const payload = await authFetch("/api/admin/users?perPage=100");
      setUsers(payload.users ?? []);
      setActor(payload.actor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !q || [user.full_name, user.email, user.phone].some((v) => v?.toLowerCase().includes(q));
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? user.is_active : !user.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
    admins: users.filter((u) => u.role === "admin" || u.role === "super_admin").length,
  }), [users]);

  function resetForm() {
    setSelected(null); setFullName(""); setEmail(""); setPhone(""); setRole("warehouse"); setPassword(""); setCreateMode("invite");
  }

  function openCreate() { resetForm(); setModal("create"); setError(null); setSuccess(null); }
  function openEdit(user: UserRow) {
    setSelected(user); setFullName(user.full_name ?? ""); setEmail(user.email ?? ""); setPhone(user.phone ?? ""); setRole(user.role); setModal("edit"); setError(null); setSuccess(null);
  }
  function openPassword(user: UserRow) { setSelected(user); setPassword(""); setModal("password"); setError(null); setSuccess(null); }
  function closeModal() { setModal(null); resetForm(); }

  async function createUser(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    try {
      await authFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ email, full_name: fullName, phone, role, mode: createMode, password }) });
      setSuccess(createMode === "invite" ? "Invitation sent and user created." : "User created with temporary password.");
      closeModal(); await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "User could not be created."); }
    finally { setBusy(false); }
  }

  async function updateUser(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError(null); setSuccess(null);
    try {
      await authFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: selected.id, action: "update", email, full_name: fullName, phone, role }) });
      setSuccess("User profile and role updated."); closeModal(); await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "User could not be updated."); }
    finally { setBusy(false); }
  }

  async function setTemporaryPassword(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError(null);
    try {
      await authFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: selected.id, action: "set_password", password }) });
      setSuccess("Temporary password updated."); closeModal();
    } catch (err) { setError(err instanceof Error ? err.message : "Password could not be updated."); }
    finally { setBusy(false); }
  }

  async function sendReset(user: UserRow) {
    if (!confirm(`Send password reset email to ${user.email}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await authFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: user.id, action: "send_reset" }) });
      setSuccess("Password reset email sent.");
    } catch (err) { setError(err instanceof Error ? err.message : "Reset email could not be sent."); }
    finally { setBusy(false); }
  }

  async function toggleActive(user: UserRow) {
    const next = !user.is_active;
    if (!confirm(`${next ? "Activate" : "Deactivate"} ${user.email}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await authFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: user.id, action: "set_active", is_active: next }) });
      setSuccess(next ? "User activated." : "User deactivated."); await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "Status could not be changed."); }
    finally { setBusy(false); }
  }

  async function deleteUser(user: UserRow) {
    if (!confirm(`Permanently delete ${user.email}?\n\nThis cannot be undone.`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await authFetch(`/api/admin/users?user_id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      setSuccess("User deleted."); await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "User could not be deleted."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Total users', stats.total], ['Active', stats.active], ['Inactive', stats.inactive], ['Admins', stats.admins]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Users & Access</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create users, assign roles, manage account status and password recovery.</p></div>
            <button className={buttonPrimary} onClick={openCreate}>+ Add user</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone" />
            <select className={inputClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">All roles</option>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </div>
        </div>

        {(error || success) && <div className={`mx-5 mt-5 rounded-lg border px-4 py-3 text-sm ${error ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"}`}>{error ?? success}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead><tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">{["User", "Role", "Status", "Email", "Last sign in", "Actions"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">Loading users...</td></tr> : filteredUsers.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">No users match the current filters.</td></tr> : filteredUsers.map((user) => (
                <tr key={user.id} className="text-sm text-gray-700 dark:text-gray-300">
                  <td className="px-5 py-4"><div className="font-medium text-gray-800 dark:text-white/90">{user.full_name || "Unnamed user"}</div><div className="mt-1 text-xs text-gray-500">{user.email}</div>{user.phone && <div className="mt-1 text-xs text-gray-500">{user.phone}</div>}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">{ROLE_LABELS[user.role]}</span></td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.is_active ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"}`}>{user.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-5 py-4">{user.email_confirmed_at ? <span className="text-success-600">Verified</span> : <span className="text-warning-600">Pending</span>}</td>
                  <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-500">{formatDate(user.last_sign_in_at)}</td>
                  <td className="px-5 py-4"><div className="flex min-w-[310px] flex-wrap gap-2"><button className={buttonSecondary} disabled={busy} onClick={() => openEdit(user)}>Edit</button><button className={buttonSecondary} disabled={busy} onClick={() => void sendReset(user)}>Reset email</button><button className={buttonSecondary} disabled={busy} onClick={() => openPassword(user)}>Temp password</button><button className={buttonSecondary} disabled={busy || actor?.id === user.id} onClick={() => void toggleActive(user)}>{user.is_active ? "Deactivate" : "Activate"}</button><button className={`${buttonSecondary} text-error-600`} disabled={busy || actor?.id === user.id} onClick={() => void deleteUser(user)}>Delete</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-5 flex items-start justify-between"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{modal === "create" ? "Add user" : modal === "edit" ? "Edit user" : "Set temporary password"}</h3><p className="mt-1 text-sm text-gray-500">{selected?.email ?? "Create a new Modulex account"}</p></div><button onClick={closeModal} className="text-gray-500">✕</button></div>
        {modal === "password" ? <form onSubmit={setTemporaryPassword} className="space-y-4"><div><label className="mb-1.5 block text-sm font-medium">New temporary password</label><input type="password" minLength={8} required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /><p className="mt-1 text-xs text-gray-500">Minimum 8 characters. Share it through a secure channel.</p></div><div className="flex justify-end gap-3"><button type="button" className={buttonSecondary} onClick={closeModal}>Cancel</button><button className={buttonPrimary} disabled={busy}>Set password</button></div></form> : <form onSubmit={modal === "create" ? createUser : updateUser} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium">Full name</label><input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} /></div><div><label className="mb-1.5 block text-sm font-medium">Phone</label><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></div></div>
          <div><label className="mb-1.5 block text-sm font-medium">Email</label><input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="mb-1.5 block text-sm font-medium">Role</label><select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>{roles.filter((r) => actor?.role === "super_admin" || r !== "super_admin").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
          {modal === "create" && <><div><label className="mb-1.5 block text-sm font-medium">Account setup</label><select className={inputClass} value={createMode} onChange={(e) => setCreateMode(e.target.value as "invite" | "password")}><option value="invite">Send invitation email</option><option value="password">Create with temporary password</option></select></div>{createMode === "password" && <div><label className="mb-1.5 block text-sm font-medium">Temporary password</label><input type="password" required minLength={8} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}</>}
          <div className="flex justify-end gap-3"><button type="button" className={buttonSecondary} onClick={closeModal}>Cancel</button><button className={buttonPrimary} disabled={busy}>{modal === "create" ? "Create user" : "Save changes"}</button></div>
        </form>}
      </div></div>}
    </div>
  );
}
