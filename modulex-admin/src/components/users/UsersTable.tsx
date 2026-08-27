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

type Actor = {
  id: string;
  role: UserRole;
};

type ModalMode = "create" | "edit" | "password" | null;

type UserForm = {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  createMode: "invite" | "password";
  password: string;
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 transition-colors focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:bg-white/[0.03]";
const buttonPrimary =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary =
  "inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";
const buttonDanger =
  "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-xs font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/30 dark:bg-gray-900 dark:text-error-400 dark:hover:bg-error-500/10";

const emptyForm: UserForm = {
  fullName: "",
  email: "",
  phone: "",
  role: "warehouse",
  createMode: "invite",
  password: "",
};

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function initials(user: UserRow) {
  const name = user.full_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return user.email?.[0]?.toUpperCase() ?? "?";
}

function canActorAssignRole(actor: Actor | null, role: UserRole) {
  if (!actor) return false;
  if (role === "super_admin") return actor.role === "super_admin";
  return actor.role === "super_admin" || actor.role === "admin";
}

export default function UsersTable() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

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

  useEffect(() => {
    void loadUsers();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !q ||
        [user.full_name, user.email, user.phone].some((value) =>
          value?.toLowerCase().includes(q)
        );
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? user.is_active : !user.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.is_active).length,
      inactive: users.filter((user) => !user.is_active).length,
      finance: users.filter((user) => user.role === "finance").length,
    }),
    [users]
  );

  function openCreate() {
    setSelected(null);
    setForm(emptyForm);
    setModal("create");
    setError(null);
    setSuccess(null);
  }

  function openEdit(user: UserRow) {
    setSelected(user);
    setForm({
      ...emptyForm,
      fullName: user.full_name ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      role: user.role,
    });
    setModal("edit");
    setError(null);
    setSuccess(null);
  }

  function openPassword(user: UserRow) {
    setSelected(user);
    setForm({ ...emptyForm, password: "" });
    setModal("password");
    setError(null);
    setSuccess(null);
  }

  function closeModal() {
    setModal(null);
    setSelected(null);
    setForm(emptyForm);
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: form.email,
          full_name: form.fullName,
          phone: form.phone,
          role: form.role,
          mode: form.createMode,
          password: form.password,
        }),
      });
      closeModal();
      setSuccess(form.createMode === "invite" ? "Invitation sent and user created." : "User created with temporary password.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          user_id: selected.id,
          action: "update",
          email: form.email,
          full_name: form.fullName,
          phone: form.phone,
          role: form.role,
        }),
      });
      closeModal();
      setSuccess("User profile and role updated.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          user_id: selected.id,
          action: "set_password",
          password: form.password,
        }),
      });
      closeModal();
      setSuccess("Temporary password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(user: UserRow) {
    if (!confirm(`Send password reset email to ${user.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ user_id: user.id, action: "send_reset" }),
      });
      setSuccess("Password reset email sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset email could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: UserRow) {
    const next = !user.is_active;
    if (!confirm(`${next ? "Activate" : "Deactivate"} ${user.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ user_id: user.id, action: "set_active", is_active: next }),
      });
      setSuccess(next ? "User activated." : "User deactivated.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user: UserRow) {
    if (!confirm(`Permanently delete ${user.email}?\n\nThis cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch(`/api/admin/users?user_id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      setSuccess("User deleted.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  const assignableRoles = ROLE_OPTIONS.filter((role) => canActorAssignRole(actor, role));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Total users" value={stats.total} />
        <Stat label="Active" value={stats.active} />
        <Stat label="Inactive" value={stats.inactive} />
        <Stat label="Finance" value={stats.finance} />
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Users & Access</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create accounts, assign roles and manage login access.</p>
            </div>
            <button onClick={openCreate} className={buttonPrimary}>+ Add user</button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or phone" />
            <select className={inputClass} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}>
              <option value="all">All roles</option>
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>{["User", "Role", "Status", "Last sign in", "Created", "Actions"].map((label) => <th key={label} className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">Loading users...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">No users found.</td></tr>
              ) : filtered.map((user) => {
                const protectedTarget = user.role === "super_admin" && actor?.role !== "super_admin";
                const ownAccount = user.id === actor?.id;
                return (
                  <tr key={user.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{initials(user)}</span>
                        <div><p className="text-sm font-medium text-gray-800 dark:text-white/90">{user.full_name || "Unnamed user"}</p><p className="text-xs text-gray-500">{user.email || "No email"}</p>{user.phone && <p className="text-xs text-gray-400">{user.phone}</p>}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{ROLE_LABELS[user.role]}</span></td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.is_active ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400" : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"}`}>{user.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(user.last_sign_in_at)}</td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busy || protectedTarget} onClick={() => openEdit(user)} className={buttonSecondary}>Edit</button>
                        <button disabled={busy || protectedTarget} onClick={() => openPassword(user)} className={buttonSecondary}>Password</button>
                        <button disabled={busy || protectedTarget} onClick={() => void sendReset(user)} className={buttonSecondary}>Reset</button>
                        <button disabled={busy || protectedTarget || ownAccount} onClick={() => void toggleActive(user)} className={buttonSecondary}>{user.is_active ? "Deactivate" : "Activate"}</button>
                        <button disabled={busy || protectedTarget || ownAccount} onClick={() => void deleteUser(user)} className={buttonDanger}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">{modal === "create" ? "Add User" : modal === "edit" ? "Edit User" : "Set Temporary Password"}</h3>{selected && <p className="mt-1 text-sm text-gray-500">{selected.email}</p>}</div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>
            </div>

            {modal === "password" ? (
              <form onSubmit={submitPassword} className="mt-6 space-y-4">
                <Field label="Temporary password"><input className={inputClass} type="password" minLength={8} required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></Field>
                <ModalActions busy={busy} onCancel={closeModal} submitLabel="Set password" />
              </form>
            ) : (
              <form onSubmit={modal === "create" ? submitCreate : submitEdit} className="mt-6 space-y-4">
                <Field label="Full name"><input className={inputClass} value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></Field>
                <Field label="Email"><input className={inputClass} type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
                <Field label="Role"><select className={inputClass} value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}>{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></Field>

                {modal === "create" && (
                  <>
                    <Field label="Account setup"><select className={inputClass} value={form.createMode} onChange={(event) => setForm((current) => ({ ...current, createMode: event.target.value as "invite" | "password" }))}><option value="invite">Send invitation email</option><option value="password">Create with temporary password</option></select></Field>
                    {form.createMode === "password" && <Field label="Temporary password"><input className={inputClass} type="password" minLength={8} required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></Field>}
                  </>
                )}

                <ModalActions busy={busy} onCancel={closeModal} submitLabel={modal === "create" ? "Create user" : "Save changes"} />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"}`}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>;
}

function ModalActions({ busy, onCancel, submitLabel }: { busy: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onCancel} className={buttonSecondary}>Cancel</button><button type="submit" disabled={busy} className={buttonPrimary}>{busy ? "Saving..." : submitLabel}</button></div>;
}
