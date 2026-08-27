import type { UserRole } from "@/lib/supabase/profile";
import {
  PERMISSION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";

const roles: UserRole[] = [
  "super_admin",
  "admin",
  "sales",
  "finance",
  "warehouse",
  "shipping",
];

const permissions = Object.keys(PERMISSION_LABELS) as Permission[];

export default function RolesAccess() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {roles.map((role) => (
          <div
            key={role}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
              {ROLE_LABELS[role]}
            </span>
            <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Permission Matrix
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This matrix is the central UI access policy. Database RLS and protected RPCs remain the enforcement layer for business data and mutations.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="px-5 py-3 font-medium">Permission</th>
                {roles.map((role) => (
                  <th key={role} className="px-5 py-3 text-center font-medium">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {permissions.map((permission) => (
                <tr key={permission}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {PERMISSION_LABELS[permission]}
                  </td>
                  {roles.map((role) => {
                    const allowed = ROLE_PERMISSIONS[role].includes(permission);
                    return (
                      <td key={role} className="px-5 py-3 text-center">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                            allowed
                              ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                              : "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500"
                          }`}
                        >
                          {allowed ? "✓" : "–"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm leading-6 text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
        Page visibility is not treated as security. Direct URL access is checked separately, and Supabase policies/RPC role checks protect the underlying records even if a client request is crafted manually.
      </div>
    </div>
  );
}
