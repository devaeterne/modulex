"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableViewport } from "@/components/ui/table";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/supabase/profile";
import { isValidEmail, isValidPhone, normalizeEmail, sanitizePhoneInput } from "@/lib/validation";

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  roles: UserRole[];
  is_active: boolean;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
};

type Actor = { id: string; role: UserRole; roles: UserRole[] };
type UsersPayload = { users?: UserRow[]; actor?: Actor };
type ModalMode = "create" | "edit" | "password" | null;
type UserForm = {
  fullName: string;
  email: string;
  phone: string;
  roles: UserRole[];
  createMode: "invite" | "password";
  password: string;
};
export type UserFieldErrors = { email?: string; phone?: string; password?: string; roles?: string };

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];
const emptyForm: UserForm = { fullName: "", email: "", phone: "", roles: ["warehouse"], createMode: "invite", password: "" };

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function effectiveRoles(user: UserRow) { return user.roles?.length ? user.roles : [user.role]; }
function actorRoles(actor: Actor | null) { return actor ? (actor.roles?.length ? actor.roles : [actor.role]) : []; }
function canActorAssignRole(actor: Actor | null, role: UserRole) {
  const roles = actorRoles(actor);
  return role === "super_admin" ? roles.includes("super_admin") : roles.includes("super_admin") || roles.includes("admin");
}
function isElevatedRole(role: UserRole) { return role === "super_admin" || role === "admin"; }
function ignoreModalDismiss() {}

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
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});

  async function loadUsers() {
    setLoading(true); setError(null);
    try {
      const payload = await authenticatedFetch<UsersPayload>("/api/admin/users?perPage=100");
      setUsers(payload.users ?? []); setActor(payload.actor ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Users could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadUsers(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !query || [user.full_name, user.email, user.phone].some((value) => value?.toLowerCase().includes(query));
      const matchesRole = roleFilter === "all" || effectiveRoles(user).includes(roleFilter);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? user.is_active : !user.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.is_active).length,
    inactive: users.filter((user) => !user.is_active).length,
    finance: users.filter((user) => effectiveRoles(user).includes("finance")).length,
  }), [users]);

  function resetErrors() { setFieldErrors({}); }
  function openCreate() { setSelected(null); setForm({ ...emptyForm, roles: [...emptyForm.roles] }); resetErrors(); setModal("create"); setError(null); setSuccess(null); }
  function openEdit(user: UserRow) { setSelected(user); setForm({ ...emptyForm, fullName: user.full_name ?? "", email: user.email ?? "", phone: user.phone ?? "", roles: [...effectiveRoles(user)] }); resetErrors(); setModal("edit"); setError(null); setSuccess(null); }
  function openPassword(user: UserRow) { setSelected(user); setForm({ ...emptyForm, roles: [...emptyForm.roles] }); resetErrors(); setModal("password"); setError(null); setSuccess(null); }
  function closeModal() { setModal(null); setSelected(null); setForm({ ...emptyForm, roles: [...emptyForm.roles] }); resetErrors(); }

  function toggleRole(role: UserRole) {
    setFieldErrors((current) => ({ ...current, roles: undefined }));
    setForm((current) => {
      if (isElevatedRole(role)) return { ...current, roles: current.roles.includes(role) ? current.roles : [role] };
      const operational = current.roles.filter((item) => !isElevatedRole(item));
      if (operational.includes(role)) return operational.length === 1 ? current : { ...current, roles: operational.filter((item) => item !== role) };
      return { ...current, roles: [...operational, role] };
    });
  }

  function focusFirstInvalid(errors: UserFieldErrors) {
    const id = errors.email ? "user-email" : errors.phone ? "user-phone" : errors.roles ? "user-role-warehouse" : errors.password ? (modal === "password" ? "user-temporary-password" : "user-create-password") : null;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function validateUserForm(includePassword: boolean) {
    const next: UserFieldErrors = {};
    const email = normalizeEmail(form.email);
    const phone = sanitizePhoneInput(form.phone).trim();
    if (!email || !isValidEmail(email)) next.email = "Enter a valid email address.";
    if (phone && !isValidPhone(phone)) next.phone = "Enter a valid phone number using 7 to 15 digits.";
    if (form.roles.length === 0) next.roles = "Select at least one role.";
    if (includePassword && form.password.length < 8) next.password = "Password must be at least 8 characters.";
    setFieldErrors(next);
    if (Object.keys(next).length) { focusFirstInvalid(next); return null; }
    return { email, phone, full_name: form.fullName.trim() || null, roles: form.roles };
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const validated = validateUserForm(form.createMode === "password");
    if (!validated) return;
    setBusy(true); setError(null);
    try {
      await authenticatedFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ email: validated.email, full_name: validated.full_name, phone: validated.phone, roles: validated.roles, mode: form.createMode, password: form.password }) });
      closeModal(); setSuccess(form.createMode === "invite" ? "Invitation sent and user created." : "User created with temporary password."); await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "User could not be created."); }
    finally { setBusy(false); }
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    const validated = validateUserForm(false); if (!validated) return;
    setBusy(true); setError(null);
    try {
      await authenticatedFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: selected.id, action: "update", email: validated.email, full_name: validated.full_name, phone: validated.phone, roles: validated.roles }) });
      closeModal(); setSuccess("User profile and roles updated."); await loadUsers();
    } catch (err) { setError(err instanceof Error ? err.message : "User could not be updated."); }
    finally { setBusy(false); }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    const next: UserFieldErrors = form.password.length >= 8 ? {} : { password: "Password must be at least 8 characters." };
    setFieldErrors(next); if (next.password) { focusFirstInvalid(next); return; }
    setBusy(true); setError(null);
    try {
      await authenticatedFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: selected.id, action: "set_password", password: form.password }) });
      closeModal(); setSuccess("Temporary password updated.");
    } catch (err) { setError(err instanceof Error ? err.message : "Password could not be updated."); }
    finally { setBusy(false); }
  }

  async function sendReset(user: UserRow) {
    if (!confirm(`Send password reset email to ${user.email}?`)) return;
    setBusy(true); setError(null);
    try { await authenticatedFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: user.id, action: "send_reset" }) }); setSuccess("Password reset email sent."); }
    catch (err) { setError(err instanceof Error ? err.message : "Reset email could not be sent."); }
    finally { setBusy(false); }
  }
  async function toggleActive(user: UserRow) {
    const next = !user.is_active;
    if (!confirm(`${next ? "Activate" : "Deactivate"} ${user.email}?`)) return;
    setBusy(true); setError(null);
    try { await authenticatedFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ user_id: user.id, action: "set_active", is_active: next }) }); setSuccess(next ? "User activated." : "User deactivated."); await loadUsers(); }
    catch (err) { setError(err instanceof Error ? err.message : "Status could not be changed."); }
    finally { setBusy(false); }
  }
  async function deleteUser(user: UserRow) {
    if (!confirm(`Permanently delete ${user.email}?\n\nThis cannot be undone.`)) return;
    setBusy(true); setError(null);
    try { await authenticatedFetch(`/api/admin/users?user_id=${encodeURIComponent(user.id)}`, { method: "DELETE" }); setSuccess("User deleted."); await loadUsers(); }
    catch (err) { setError(err instanceof Error ? err.message : "User could not be deleted."); }
    finally { setBusy(false); }
  }

  const assignableRoles = ROLE_OPTIONS.filter((role) => canActorAssignRole(actor, role));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <ComponentCard title={String(stats.total)} desc="Total users" />
        <ComponentCard title={String(stats.active)} desc="Active" />
        <ComponentCard title={String(stats.inactive)} desc="Inactive" />
        <ComponentCard title={String(stats.finance)} desc="Finance" />
      </div>
      {error ? <Alert variant="error" title="User management error" message={error} /> : null}
      {success ? <Alert variant="success" title="User management updated" message={success} /> : null}

      <ComponentCard title="Users & Access" desc="Create accounts, combine operational roles and manage login access.">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <div><Label htmlFor="users-search" className="sr-only">Search users</Label><Input id="users-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or phone" /></div>
            <div><Label htmlFor="users-role-filter" className="sr-only">Filter users by role</Label><Select id="users-role-filter" value={roleFilter} options={[{ value: "all", label: "All roles" }, ...ROLE_OPTIONS.map((role) => ({ value: role, label: ROLE_LABELS[role] }))]} onChange={(value) => setRoleFilter(value as "all" | UserRole)} /></div>
            <div><Label htmlFor="users-status-filter" className="sr-only">Filter users by status</Label><Select id="users-status-filter" value={statusFilter} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} onChange={(value) => setStatusFilter(value as "all" | "active" | "inactive")} /></div>
          </div>
          <Button className="w-full lg:w-auto" onClick={openCreate}>+ Add user</Button>
        </div>

        <TableViewport><Table variant="admin" minWidth="wide"><TableHeader variant="admin"><TableRow>{["User", "Roles", "Status", "Last sign in", "Created", "Actions"].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow></TableHeader><TableBody variant="admin">
          {loading ? <TableRow><TableCell variant="admin" colSpan={6}>Loading users...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell variant="admin" colSpan={6}>No users found.</TableCell></TableRow> : filtered.map((user) => {
            const roles = effectiveRoles(user);
            const protectedTarget = roles.includes("super_admin") && !actorRoles(actor).includes("super_admin");
            const ownAccount = user.id === actor?.id;
            return <TableRow key={user.id}>
              <TableCell variant="admin"><div className="space-y-1"><strong>{user.full_name || "Unnamed user"}</strong><div>{user.email || "No email"}</div>{user.phone ? <div>{user.phone}</div> : null}</div></TableCell>
              <TableCell variant="admin"><div className="flex flex-wrap gap-1.5">{roles.map((role) => <Badge key={role} color="light" size="sm">{ROLE_LABELS[role]}</Badge>)}</div></TableCell>
              <TableCell variant="admin"><Badge color={user.is_active ? "success" : "light"} size="sm">{user.is_active ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell variant="admin">{formatDate(user.last_sign_in_at)}</TableCell><TableCell variant="admin">{formatDate(user.created_at)}</TableCell>
              <TableCell variant="admin"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || protectedTarget} onClick={() => openEdit(user)}>Edit</Button><Button size="sm" variant="outline" disabled={busy || protectedTarget} onClick={() => openPassword(user)}>Password</Button><Button size="sm" variant="outline" disabled={busy || protectedTarget} onClick={() => void sendReset(user)}>Reset</Button><Button size="sm" variant="outline" disabled={busy || protectedTarget || ownAccount} onClick={() => void toggleActive(user)}>{user.is_active ? "Deactivate" : "Activate"}</Button><Button size="sm" variant="danger" disabled={busy || protectedTarget || ownAccount} onClick={() => void deleteUser(user)}>Delete</Button></div></TableCell>
            </TableRow>;
          })}
        </TableBody></Table></TableViewport>
      </ComponentCard>

      <Modal isOpen={modal !== null} onClose={ignoreModalDismiss} closeOnEscape={false} showCloseButton={false} className="m-4 max-w-xl">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold">{modal === "create" ? "Add User" : modal === "edit" ? "Edit User" : "Set Temporary Password"}</h3>{selected ? <p>{selected.email}</p> : null}</div><Button size="sm" variant="outline" onClick={closeModal}>Close</Button></div>
          {modal === "password" ? <form onSubmit={submitPassword} className="space-y-4"><div><Label htmlFor="user-temporary-password">Temporary password</Label><Input id="user-temporary-password" type="password" minLength={8} required value={form.password} onChange={(event) => { setForm((current) => ({ ...current, password: event.target.value })); setFieldErrors((current) => ({ ...current, password: undefined })); }} error={Boolean(fieldErrors.password)} hint={fieldErrors.password} /></div><ModalActions busy={busy} onCancel={closeModal} submitLabel="Set password" /></form> : modal ? <form onSubmit={modal === "create" ? submitCreate : submitEdit} className="space-y-4">
            <div><Label htmlFor="user-full-name">Full name</Label><Input id="user-full-name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></div>
            <div><Label htmlFor="user-email">Email</Label><Input id="user-email" type="email" required value={form.email} onChange={(event) => { setForm((current) => ({ ...current, email: event.target.value })); setFieldErrors((current) => ({ ...current, email: undefined })); }} error={Boolean(fieldErrors.email)} hint={fieldErrors.email} /></div>
            <div><Label htmlFor="user-phone">Phone</Label><Input id="user-phone" type="tel" value={form.phone} onChange={(event) => { setForm((current) => ({ ...current, phone: sanitizePhoneInput(event.target.value) })); setFieldErrors((current) => ({ ...current, phone: undefined })); }} error={Boolean(fieldErrors.phone)} hint={fieldErrors.phone} /></div>
            <div><Label>Roles</Label><div className="grid gap-3 sm:grid-cols-2">{assignableRoles.map((role) => <Checkbox key={role} id={`user-role-${role}`} label={ROLE_LABELS[role]} checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />)}</div>{fieldErrors.roles ? <Alert variant="error" title="Role selection" message={fieldErrors.roles} /> : null}</div>
            {modal === "create" ? <><div><Label htmlFor="user-create-mode">Account setup</Label><Select id="user-create-mode" value={form.createMode} options={[{ value: "invite", label: "Send invitation email" }, { value: "password", label: "Create with temporary password" }]} onChange={(value) => setForm((current) => ({ ...current, createMode: value as "invite" | "password" }))} /></div>{form.createMode === "password" ? <div><Label htmlFor="user-create-password">Temporary password</Label><Input id="user-create-password" type="password" minLength={8} required value={form.password} onChange={(event) => { setForm((current) => ({ ...current, password: event.target.value })); setFieldErrors((current) => ({ ...current, password: undefined })); }} error={Boolean(fieldErrors.password)} hint={fieldErrors.password} /></div> : null}</> : null}
            <ModalActions busy={busy} onCancel={closeModal} submitLabel={modal === "create" ? "Create user" : "Save changes"} />
          </form> : null}
        </div>
      </Modal>
    </div>
  );
}

function ModalActions({ busy, onCancel, submitLabel }: { busy: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel}>Cancel</Button><Button type="submit" className="w-full sm:w-auto" disabled={busy}>{busy ? "Saving..." : submitLabel}</Button></div>;
}
