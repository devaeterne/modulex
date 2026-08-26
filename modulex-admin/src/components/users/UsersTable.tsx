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

const roles: UserRole[] = [
  "super_admin",
  "admin",
  "sales",
  "warehouse",
  "shipping",
];

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 transition-colors focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:bg-white/[0.03]";

const labelClass =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const buttonPrimary =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const buttonSecondary =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-hidden focus:ring-3 focus:ring-gray-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

const buttonDanger =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-error-200 bg-white px-3 text-xs font-medium text-error-600 transition hover:bg-error-50 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/30 dark:bg-gray-900 dark:text-error-400 dark:hover:bg-error-500/10";

function formatDate(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getInitials(user: UserRow) {
  const name = user.full_name?.trim();

  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  return user.email?.charAt(0).toUpperCase() ?? "?";
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

  const [createMode, setCreateMode] = useState<"invite" | "password">(
    "invite"
  );

  const [password, setPassword] = useState("");

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error("Session expired. Please sign in again.");
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

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
      setError(
        err instanceof Error ? err.message : "Users could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !q ||
        [user.full_name, user.email, user.phone].some((value) =>
          value?.toLowerCase().includes(q)
        );

      const matchesRole =
        roleFilter === "all" || user.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active"
          ? user.is_active
          : !user.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.is_active).length,
      inactive: users.filter((user) => !user.is_active).length,
      admins: users.filter(
        (user) =>
          user.role === "admin" || user.role === "super_admin"
      ).length,
    }),
    [users]
  );

  const statCards = [
    {
      label: "Total users",
      value: stats.total,
      description: "All registered accounts",
    },
    {
      label: "Active",
      value: stats.active,
      description: "Accounts with access",
    },
    {
      label: "Inactive",
      value: stats.inactive,
      description: "Disabled accounts",
    },
    {
      label: "Admins",
      value: stats.admins,
      description: "Administrative users",
    },
  ];

  function resetForm() {
    setSelected(null);
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("warehouse");
    setPassword("");
    setCreateMode("invite");
  }

  function openCreate() {
    resetForm();

    setModal("create");
    setError(null);
    setSuccess(null);
  }

  function openEdit(user: UserRow) {
    setSelected(user);
    setFullName(user.full_name ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setRole(user.role);

    setModal("edit");
    setError(null);
    setSuccess(null);
  }

  function openPassword(user: UserRow) {
    setSelected(user);
    setPassword("");

    setModal("password");
    setError(null);
    setSuccess(null);
  }

  function closeModal() {
    setModal(null);
    resetForm();
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          full_name: fullName,
          phone,
          role,
          mode: createMode,
          password,
        }),
      });

      setSuccess(
        createMode === "invite"
          ? "Invitation sent and user created."
          : "User created with temporary password."
      );

      closeModal();

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "User could not be created."
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(event: React.FormEvent) {
    event.preventDefault();

    if (!selected) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          user_id: selected.id,
          action: "update",
          email,
          full_name: fullName,
          phone,
          role,
        }),
      });

      setSuccess("User profile and role updated.");

      closeModal();

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "User could not be updated."
      );
    } finally {
      setBusy(false);
    }
  }

  async function setTemporaryPassword(event: React.FormEvent) {
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
          password,
        }),
      });

      setSuccess("Temporary password updated.");

      closeModal();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Password could not be updated."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(user: UserRow) {
    if (
      !confirm(`Send password reset email to ${user.email}?`)
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          user_id: user.id,
          action: "send_reset",
        }),
      });

      setSuccess("Password reset email sent.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Reset email could not be sent."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: UserRow) {
    const next = !user.is_active;

    if (
      !confirm(
        `${next ? "Activate" : "Deactivate"} ${user.email}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          user_id: user.id,
          action: "set_active",
          is_active: next,
        }),
      });

      setSuccess(
        next ? "User activated." : "User deactivated."
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Status could not be changed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user: UserRow) {
    if (
      !confirm(
        `Permanently delete ${user.email}?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await authFetch(
        `/api/admin/users?user_id=${encodeURIComponent(user.id)}`,
        {
          method: "DELETE",
        }
      );

      setSuccess("User deleted.");

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "User could not be deleted."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>

                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
                  {item.value}
                </p>

                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Users & Access
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create users, assign roles, manage account status
                and password recovery.
              </p>
            </div>

            <button
              type="button"
              className={`${buttonPrimary} w-full sm:w-auto`}
              onClick={openCreate}
            >
              <span className="mr-2 text-lg leading-none">+</span>
              Add user
            </button>
          </div>

          {/* Filters */}
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="sr-only" htmlFor="user-search">
                Search users
              </label>

              <input
                id="user-search"
                type="text"
                className={inputClass}
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search name, email or phone"
              />
            </div>

            <div>
              <label className="sr-only" htmlFor="role-filter">
                Filter by role
              </label>

              <select
                id="role-filter"
                className={inputClass}
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value)
                }
              >
                <option value="all">All roles</option>

                {roles.map((item) => (
                  <option key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="sr-only"
                htmlFor="status-filter"
              >
                Filter by status
              </label>

              <select
                id="status-filter"
                className={inputClass}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className="px-5 pt-5">
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${error
                ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
                : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
                }`}
            >
              {error ?? success}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  User
                </th>

                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Role
                </th>

                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Status
                </th>

                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Email
                </th>

                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Last sign in
                </th>

                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-14 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />

                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Loading users...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-14 text-center"
                  >
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      No users found
                    </p>

                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      No users match the current filters.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                  >
                    {/* User */}
                    <td className="px-5 py-4">
                      <div className="flex min-w-[220px] items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                          {getInitials(user)}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                            {user.full_name || "Unnamed user"}
                          </p>

                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-gray-500 dark:text-gray-400">
                            {user.email || "No email"}
                          </p>

                          {user.phone && (
                            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                              {user.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      <span className="inline-flex whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${user.is_active
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
                          }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${user.is_active
                            ? "bg-success-500"
                            : "bg-gray-400"
                            }`}
                        />

                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Verification */}
                    <td className="px-5 py-4">
                      {user.email_confirmed_at ? (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                          Pending
                        </span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(user.last_sign_in_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="ml-auto flex w-[245px] flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={busy}
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={busy}
                          onClick={() => void sendReset(user)}
                        >
                          Reset email
                        </button>

                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={busy}
                          onClick={() => openPassword(user)}
                        >
                          Temp password
                        </button>

                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={
                            busy || actor?.id === user.id
                          }
                          onClick={() =>
                            void toggleActive(user)
                          }
                        >
                          {user.is_active
                            ? "Deactivate"
                            : "Activate"}
                        </button>

                        <button
                          type="button"
                          className={buttonDanger}
                          disabled={
                            busy || actor?.id === user.id
                          }
                          onClick={() => void deleteUser(user)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex flex-col gap-2 border-t border-gray-200 px-5 py-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {filteredUsers.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {users.length}
              </span>{" "}
              users
            </span>

            {(search ||
              roleFilter !== "all" ||
              statusFilter !== "all") && (
                <button
                  type="button"
                  className="font-medium text-brand-500 transition hover:text-brand-600 dark:text-brand-400"
                  onClick={() => {
                    setSearch("");
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </button>
              )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[calc(100vh-32px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {modal === "create"
                    ? "Add user"
                    : modal === "edit"
                      ? "Edit user"
                      : "Set temporary password"}
                </h3>

                <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                  {selected?.email ??
                    "Create a new Modulex account"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-hidden focus:ring-3 focus:ring-gray-500/10 dark:hover:bg-white/[0.05] dark:hover:text-gray-300"
                aria-label="Close modal"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            {/* Password modal */}
            {modal === "password" ? (
              <form
                onSubmit={setTemporaryPassword}
                className="p-6"
              >
                <div>
                  <label className={labelClass}>
                    New temporary password
                    <span className="ml-1 text-error-500">
                      *
                    </span>
                  </label>

                  <input
                    type="password"
                    minLength={8}
                    required
                    className={inputClass}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Minimum 8 characters"
                  />

                  <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Minimum 8 characters. Share the temporary
                    password with the user through a secure
                    channel.
                  </p>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className={`${buttonSecondary} h-10 w-full px-4 text-sm sm:w-auto`}
                    onClick={closeModal}
                    disabled={busy}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className={`${buttonPrimary} w-full sm:w-auto`}
                    disabled={busy}
                  >
                    {busy ? "Saving..." : "Set password"}
                  </button>
                </div>
              </form>
            ) : (
              /* Create / Edit modal */
              <form
                onSubmit={
                  modal === "create"
                    ? createUser
                    : updateUser
                }
                className="p-6"
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Full name
                    </label>

                    <input
                      type="text"
                      className={inputClass}
                      value={fullName}
                      onChange={(event) =>
                        setFullName(event.target.value)
                      }
                      placeholder="Full name"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Phone
                    </label>

                    <input
                      type="tel"
                      className={inputClass}
                      value={phone}
                      onChange={(event) =>
                        setPhone(event.target.value)
                      }
                      placeholder="+382..."
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Email
                      <span className="ml-1 text-error-500">
                        *
                      </span>
                    </label>

                    <input
                      type="email"
                      required
                      className={inputClass}
                      value={email}
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      placeholder="user@example.com"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Role
                    </label>

                    <select
                      className={inputClass}
                      value={role}
                      onChange={(event) =>
                        setRole(
                          event.target.value as UserRole
                        )
                      }
                    >
                      {roles
                        .filter(
                          (item) =>
                            actor?.role === "super_admin" ||
                            item !== "super_admin"
                        )
                        .map((item) => (
                          <option key={item} value={item}>
                            {ROLE_LABELS[item]}
                          </option>
                        ))}
                    </select>
                  </div>

                  {modal === "create" && (
                    <>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>
                          Account setup
                        </label>

                        <select
                          className={inputClass}
                          value={createMode}
                          onChange={(event) =>
                            setCreateMode(
                              event.target.value as
                              | "invite"
                              | "password"
                            )
                          }
                        >
                          <option value="invite">
                            Send invitation email
                          </option>

                          <option value="password">
                            Create with temporary password
                          </option>
                        </select>

                        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                          Invitation sends an account activation
                          email. Temporary password creates the
                          account immediately.
                        </p>
                      </div>

                      {createMode === "password" && (
                        <div className="sm:col-span-2">
                          <label className={labelClass}>
                            Temporary password
                            <span className="ml-1 text-error-500">
                              *
                            </span>
                          </label>

                          <input
                            type="password"
                            required
                            minLength={8}
                            className={inputClass}
                            value={password}
                            onChange={(event) =>
                              setPassword(event.target.value)
                            }
                            placeholder="Minimum 8 characters"
                          />

                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Minimum 8 characters.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className={`${buttonSecondary} h-10 w-full px-4 text-sm sm:w-auto`}
                    onClick={closeModal}
                    disabled={busy}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className={`${buttonPrimary} w-full sm:w-auto`}
                    disabled={busy}
                  >
                    {busy
                      ? "Saving..."
                      : modal === "create"
                        ? "Create user"
                        : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}