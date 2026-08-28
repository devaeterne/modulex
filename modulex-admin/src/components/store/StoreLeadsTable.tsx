"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { LeadAssignee, StoreLead, StoreLeadStatus, StoreLeadType } from "@/lib/store/leads";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const statusLabels: Record<StoreLeadStatus, string> = {
  new: "New",
  under_review: "Under Review",
  contacted: "Contacted",
  qualified: "Qualified",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

function statusClass(status: StoreLeadStatus) {
  if (status === "approved" || status === "qualified") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "rejected") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "new" || status === "under_review") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function typeLabel(type: StoreLeadType) {
  return type === "dealer_application" ? "Dealer Application" : "Contact Inquiry";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function StoreLeadsTable() {
  const [leads, setLeads] = useState<StoreLead[]>([]);
  const [assignees, setAssignees] = useState<LeadAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | StoreLeadType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StoreLeadStatus>("all");

  useEffect(() => {
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError || !profile || !["super_admin", "admin", "sales"].includes(profile.role)) {
        setError(profileError?.message || "You do not have access to Store leads.");
        setLoading(false);
        return;
      }

      const [leadResult, profileResult] = await Promise.all([
        supabase.from("store_leads").select("*").order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["super_admin", "admin", "sales"])
          .eq("is_active", true)
          .order("full_name"),
      ]);

      if (leadResult.error || profileResult.error) {
        setError(leadResult.error?.message || profileResult.error?.message || "Unable to load leads.");
      } else {
        setLeads((leadResult.data ?? []) as StoreLead[]);
        setAssignees((profileResult.data ?? []) as LeadAssignee[]);
      }
      setLoading(false);
    }

    void load();
  }, []);

  const assigneeMap = useMemo(
    () => new Map(assignees.map((item) => [item.id, item.full_name || item.email || "Unknown user"])),
    [assignees]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const haystack = [
        lead.reference_code,
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.phone,
        lead.company_name,
        lead.city,
        lead.country_code,
        lead.utm_source,
        lead.utm_campaign,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query || haystack.includes(query)) &&
        (typeFilter === "all" || lead.lead_type === typeFilter) &&
        (statusFilter === "all" || lead.status === statusFilter)
      );
    });
  }, [leads, search, typeFilter, statusFilter]);

  const summary = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter((item) => item.status === "new").length,
      dealers: leads.filter((item) => item.lead_type === "dealer_application").length,
      qualified: leads.filter((item) => item.status === "qualified" || item.status === "approved").length,
    }),
    [leads]
  );

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading Store leads...</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-300">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total Leads", summary.total],
          ["New", summary.new],
          ["Dealer Applications", summary.dealers],
          ["Qualified / Approved", summary.qualified],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Search</span>
            <input className={inputClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, name, company, email or campaign" />
          </label>
          <label className="lg:w-56">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
            <select className={inputClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | StoreLeadType)}>
              <option value="all">All Types</option>
              <option value="contact">Contact Inquiry</option>
              <option value="dealer_application">Dealer Application</option>
            </select>
          </label>
          <label className="lg:w-56">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | StoreLeadStatus)}>
              <option value="all">All Statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {["Reference", "Type", "Contact", "Company", "Status", "Assigned", "Source", "Received", ""].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-4 font-medium text-gray-800 dark:text-white/90">{lead.reference_code}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-300">{typeLabel(lead.lead_type)}</td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-gray-800 dark:text-white/90">{lead.first_name} {lead.last_name}</div>
                    <div className="text-xs text-gray-500">{lead.email}</div>
                  </td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{lead.company_name || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(lead.status)}`}>{statusLabels[lead.status]}</span></td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{lead.assigned_to ? assigneeMap.get(lead.assigned_to) || "Assigned" : "Unassigned"}</td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{lead.utm_source || lead.source || "website"}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-500">{formatDate(lead.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right"><Link href={`/store/leads/${lead.id}`} className="font-medium text-brand-500 hover:text-brand-600">Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No leads match the current filters.</div> : null}
      </section>
    </div>
  );
}
