"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { CustomerInstallation, CustomerInstallationStatus } from "@/lib/customers/installation-types";

type Row = CustomerInstallation & { customer_name?: string | null; order_number?: string | null; assignee_name?: string | null };

const statuses: Array<"all" | CustomerInstallationStatus> = ["all", "scheduled", "confirmed", "in_progress", "completed", "cancelled"];

function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function dateTime(value: string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusClass(status: CustomerInstallationStatus) {
  if (status === "completed") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "cancelled") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "in_progress") return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  if (status === "confirmed") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function CustomerInstallationsList({ customerId }: { customerId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CustomerInstallationStatus>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) { setErrorMessage(profileError.message); setIsLoading(false); return; }
      if (!["super_admin", "admin", "sales"].includes(profile?.role ?? "")) { setErrorMessage("You do not have access to installation appointments."); setIsLoading(false); return; }

      let request = supabase.from("customer_installations").select("*").order("scheduled_start_at", { ascending: true });
      if (customerId) request = request.eq("customer_id", customerId);
      const { data, error } = await request;
      if (error) { setErrorMessage(error.message); setIsLoading(false); return; }

      const installations = (data ?? []) as CustomerInstallation[];
      const customerIds = [...new Set(installations.map((i) => i.customer_id))];
      const orderIds = [...new Set(installations.map((i) => i.order_id))];
      const profileIds = [...new Set(installations.map((i) => i.assigned_to).filter(Boolean) as string[])];

      const [customersResult, ordersResult, profilesResult] = await Promise.all([
        customerIds.length ? supabase.from("customers").select("id,name").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
        orderIds.length ? supabase.from("customer_orders").select("id,order_number").in("id", orderIds) : Promise.resolve({ data: [], error: null }),
        profileIds.length ? supabase.from("profiles").select("id,full_name,email").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
      ]);

      const customerMap = new Map((customersResult.data ?? []).map((item) => [item.id, item.name]));
      const orderMap = new Map((ordersResult.data ?? []).map((item) => [item.id, item.order_number]));
      const profileMap = new Map((profilesResult.data ?? []).map((item) => [item.id, item.full_name || item.email]));

      setRows(installations.map((item) => ({ ...item, customer_name: customerMap.get(item.customer_id) ?? null, order_number: orderMap.get(item.order_id) ?? null, assignee_name: item.assigned_to ? profileMap.get(item.assigned_to) ?? null : null })));
      setIsLoading(false);
    }
    load();
  }, [customerId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.installation_number, row.customer_name, row.order_number, row.team_name, row.assignee_name, row.contact_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [query, rows, status]);

  if (isLoading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading appointments...</div>;

  return <div className="space-y-4">
    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search appointment, customer, order or team" className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" /><select value={status} onChange={(e) => setStatus(e.target.value as "all" | CustomerInstallationStatus)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">{statuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div></div>
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["Appointment", "Customer", "Order", "Schedule", "Status", "Assigned", "Contact"].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{filtered.map((row) => <tr key={row.id}><td className="px-4 py-4"><Link href={`/customers/${row.customer_id}/installations/${row.id}`} className="text-sm font-semibold text-brand-600 dark:text-brand-400">{row.installation_number}</Link></td><td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{row.customer_name || "—"}</td><td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{row.order_number || "—"}</td><td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400"><div>{dateTime(row.scheduled_start_at)}</div>{row.scheduled_end_at && <div className="mt-1 text-xs text-gray-400">to {dateTime(row.scheduled_end_at)}</div>}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{titleCase(row.status)}</span></td><td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{row.team_name || row.assignee_name || "Unassigned"}</td><td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{row.contact_name || "—"}{row.contact_phone && <div className="mt-1 text-xs text-gray-400">{row.contact_phone}</div>}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No installation appointments found.</td></tr>}</tbody></table></div></div>
  </div>;
}
