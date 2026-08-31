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
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/profile";

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

type Actor = {
  id: string;
  role: UserRole;
  roles: UserRole[];
};

type ModalMode = "create" | "edit" | "password" | null;

type UserForm = {
  fullName: string;
  email: string;
  phone: string;
  roles: UserRole[];
  createMode: "invite" | "password";
  password: string;
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

const emptyForm: UserForm = {
  fullName: "",
  email: "",
  phone: "",
  roles: ["warehouse"],
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

function effectiveRoles(user: UserRow) {
  return user.roles?.length ? user.roles : [user.role];
}

function actorRoles(actor: Actor | null) {
  if (!actor) return [];
  return actor.roles?.length ? actor.roles : [actor.role];
}

function canActorAssignRole(actor: Actor | null, role: UserRole) {
  const roles = actorRoles(actor);
  if (role === "super_admin") return roles.includes("super_admin");
  return roles.includes("super_admin") || roles.includes("admin");
}

function isElevatedRole(role: UserRole) {
  return role === "super_admin" || role === "admin";
}

function ignoreModalDismiss() {
  // The previous Users modal did not close from backdrop clicks.
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
      const matchesRole =
        roleFilter === "all" || effectiveRoles(user).includes(roleFilter);
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
      finance: users.filter((user) => effectiveRoles(user).includes("finance")).length,
    }),
    [users]
  );

  function openCreate() {
    setSelected(null);
    setForm({ ...emptyForm, roles: [...emptyForm.roles] });
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
      roles: [...effectiveRoles(user)],
    });
    setModal("edit");
    setError(null);
    setSuccess(null);
  }

  function openPassword(user: UserRow) {
    setSelected(user);
    setForm({ ...emptyForm, roles: [...emptyForm.roles], password: "" });
    setModal("password");
    setError(null);
    setSuccess(null);
  }

  function closeModal() {
    setModal(null);
    setSelected(null);
    setForm({ ...emptyForm, roles: [...emptyForm.roles] });
  }

  function toggleRole(role: UserRole) {
    setForm((current) => {
      if (isElevatedRole(role)) {
        return {
          ...current,
          roles: current.roles.includes(role) ? current.roles : [role],
        };
      }

      const operationalRoles = current.roles.filter(
        (currentRole) => !isElevatedRole(currentRole)
      );

      if (operationalRoles.includes(role)) {
        if (operationalRoles.length === 1) {
          return current;
        }

        return {
          ...current,
          roles: operationalRoles.filter((currentRole) => currentRole !== role),
        };
      }

      return {
        ...current,
        roles: [...operationalRoles, role],
      };
    });
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
          roles: form.roles,
          mode: form.createMode,
          password: form.password,
        }),
      });
      closeModal();
      setSuccess(
        form.createMode === "invite"
          ? "Invitation sent and user created."
          : "User created with temporary password."
      );
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
          roles: form.roles,
        }),
      });
      closeModal();
      setSuccess("User profile and roles updated.");
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
      await authFetch(`/api/admin/users?user_id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
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

      {error ? <Alert variant="error" title="User management error" message={error} /> : null}
      {success ? <Alert variant="success" title="User management updated" message={success} /> : null}

      <ComponentCard
        title="Users & Access"
        desc="Create accounts, combine operational roles and manage login access."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="users-search" className="sr-only">
                Search users
              </Label>
              <Input
                id="users-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email or phone"
              />
            </div>

            <div>
              <Label htmlFor="users-role-filter" className="sr-only">
                Filter users by role
              </Label>
              <Select
                id="users-role-filter"
                value={roleFilter}
                options={[
                  { value: "all", label: "All roles" },
                  ...ROLE_OPTIONS.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
                ]}
                onChange={(value) => setRoleFilter(value as "all" | UserRole)}
              />
            </div>

            <div>
              <Label htmlFor="users-status-filter" className="sr-only">
                Filter users by status
              </Label>
              <Select
                id="users-status-filter"
                value={statusFilter}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                onChange={(value) =>
                  setStatusFilter(value as "all" | "active" | "inactive")
                }
              />
            </div>
          </div>

          <Button className="w-full lg:w-auto" onClick={openCreate}>
            + Add user
          </Button>
        </div>

        <TableViewport>
          <Table variant="admin" className="min-w-[1120px]">
            <TableHeader variant="admin">
              <TableRow>
                {["User", "Roles", "Status", "Last sign in", "Created", "Actions"].map(
                  (label) => (
                    <TableCell key={label} isHeader variant="admin" className="text-left">
                      {label}
                    </TableCell>
                  )
                )}
              </TableRow>
            </TableHeader>

            <TableBody variant="admin">
              {loading ? (
                <TableRow>
                  <TableCell variant="admin" colSpan={6} className="py-12 text-center">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell variant="admin" colSpan={6} className="py-12 text-center">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => {
                  const roles = effectiveRoles(user);
                  const protectedTarget =
                    roles.includes("super_admin") && !actorRoles(actor).includes("super_admin");
                  const ownAccount = user.id === actor?.id;

                  return (
                    <TableRow key={user.id}>
                      <TableCell variant="admin" className="align-top">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                            {initials(user)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 dark:text-white/90">
                              {user.full_name || "Unnamed user"}
                            </p>
                            <p className="break-all text-xs text-gray-500 dark:text-gray-400">
                              {user.email || "No email"}
                            </p>
                            {user.phone ? (
                              <p className="text-xs text-gray-400 dark:text-gray-500">{user.phone}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell variant="admin" className="align-top">
                        <div className="flex max-w-xs flex-wrap gap-1.5">
                          {roles.map((role) => (
                            <Badge key={role} color="light" size="sm">
                              {ROLE_LABELS[role]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell variant="admin" className="align-top">
                        <Badge color={user.is_active ? "success" : "light"} size="sm">
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>

                      <TableCell variant="admin" className="align-top text-gray-500 dark:text-gray-400">
                        {formatDate(user.last_sign_in_at)}
                      </TableCell>

                      <TableCell variant="admin" className="align-top text-gray-500 dark:text-gray-400">
                        {formatDate(user.created_at)}
                      </TableCell>

                      <TableCell variant="admin" className="align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || protectedTarget}
                            onClick={() => openEdit(user)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || protectedTarget}
                            onClick={() => openPassword(user)}
                          >
                            Password
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || protectedTarget}
                            onClick={() => void sendReset(user)}
                          >
                            Reset
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || protectedTarget || ownAccount}
                            onClick={() => void toggleActive(user)}
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || protectedTarget || ownAccount}
                            onClick={() => void deleteUser(user)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <Modal
        isOpen={modal !== null}
        onClose={ignoreModalDismiss}
        closeOnEscape={false}
        showCloseButton={false}
        className="m-4 max-w-xl"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 pr-1 dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {modal === "create"
                  ? "Add User"
                  : modal === "edit"
                    ? "Edit User"
                    : "Set Temporary Password"}
              </h3>
              {selected ? (
                <p className="mt-1 break-all text-sm text-gray-500 dark:text-gray-400">
                  {selected.email}
                </p>
              ) : null}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={closeModal}>
              Close
            </Button>
          </div>

          {modal === "password" ? (
            <form onSubmit={submitPassword} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="user-temporary-password">Temporary password</Label>
                <Input
                  id="user-temporary-password"
                  type="password"
                  minLength={8}
                  required
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </div>
              <ModalActions busy={busy} onCancel={closeModal} submitLabel="Set password" />
            </form>
          ) : modal ? (
            <form
              onSubmit={modal === "create" ? submitCreate : submitEdit}
              className="mt-5 space-y-4"
            >
              <div>
                <Label htmlFor="user-full-name">Full name</Label>
                <Input
                  id="user-full-name"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="user-phone">Phone</Label>
                <Input
                  id="user-phone"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </div>

              <div>
                <Label>Roles</Label>
                <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {assignableRoles.map((role) => (
                      <div
                        key={role}
                        className={`rounded-lg border px-3 py-2.5 transition ${
                          form.roles.includes(role)
                            ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                            : "border-gray-200 dark:border-gray-800"
                        }`}
                      >
                        <Checkbox
                          id={`user-role-${role}`}
                          label={ROLE_LABELS[role]}
                          checked={form.roles.includes(role)}
                          onChange={() => toggleRole(role)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Operational role permissions are combined. Admin and Super Admin are exclusive
                    full-access roles and cannot be combined with other roles.
                  </p>
                </div>
              </div>

              {modal === "create" ? (
                <>
                  <div>
                    <Label htmlFor="user-create-mode">Account setup</Label>
                    <Select
                      id="user-create-mode"
                      value={form.createMode}
                      options={[
                        { value: "invite", label: "Send invitation email" },
                        { value: "password", label: "Create with temporary password" },
                      ]}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          createMode: value as "invite" | "password",
                        }))
                      }
                    />
                  </div>

                  {form.createMode === "password" ? (
                    <div>
                      <Label htmlFor="user-create-password">Temporary password</Label>
                      <Input
                        id="user-create-password"
                        type="password"
                        minLength={8}
                        required
                        value={form.password}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, password: event.target.value }))
                        }
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              <ModalActions
                busy={busy}
                onCancel={closeModal}
                submitLabel={modal === "create" ? "Create user" : "Save changes"}
              />
            </form>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function ModalActions({
  busy,
  onCancel,
  submitLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
        {busy ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}
