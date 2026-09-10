"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type {
  LeadAssignee,
  StoreLeadListItem,
  StoreLeadStatus,
  StoreLeadSummary,
  StoreLeadType,
} from "@/lib/store/leads";
import { formatDateTime } from "@/lib/dates/usDate";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const pageSize = 25;

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

function typeLabel(lead: StoreLeadListItem) {
  if (lead.lead_type === "dealer_application") return "Dealer Application";
  return lead.request_kind === "project_consultation" ? "Project Consultation" : "Contact Inquiry";
}

export default function StoreLeadsTable() {
  const [leads, setLeads] = useState<StoreLeadListItem[]>([]);
  const [assignees, setAssignees] = useState<LeadAssignee[]>([]);
  const [summary, setSummary] = useState<StoreLeadSummary>({ total: 0, new: 0, dealer_applications: 0, qualified_or_approved: 0, archived: 0 });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | StoreLeadType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StoreLeadStatus>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, statusFilter, ownerFilter, includeArchived]);

  useEffect(() => {
    let active = true;
    async function identify() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (!active) return;
      if (profileError || !profile || !["super_admin", "admin", "sales"].includes(profile.role)) {
        setError(profileError?.message || "You do not have access to Store leads.");
        setLoading(false);
        return;
      }
      setProfileId(profile.id);
      setProfileRole(profile.role);
      if (["super_admin", "admin"].includes(profile.role)) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["super_admin", "admin", "sales"])
          .eq("is_active", true)
          .order("full_name");
        if (active) setAssignees((data ?? []) as LeadAssignee[]);
      } else {
        setAssignees([{ id: profile.id, full_name: profile.full_name, email: profile.email, role: profile.role }]);
      }
    }
    void identify();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profileId || !profileRole) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const assignedTo = ownerFilter === "mine" ? profileId : ownerFilter !== "all" && ownerFilter !== "unassigned" ? ownerFilter : null;
      const [pageResult, summaryResult] = await Promise.all([
        supabase.rpc("get_store_leads_page", {
          p_search: debouncedSearch || null,
          p_lead_type: typeFilter === "all" ? null : typeFilter,
          p_status: statusFilter === "all" ? null : statusFilter,
          p_assigned_to: assignedTo,
          p_unassigned: ownerFilter === "unassigned",
          p_include_archived: includeArchived,
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        }),
        supabase.rpc("get_store_lead_summary", { p_include_archived: includeArchived }),
      ]);
      if (!active) return;
      if (pageResult.error || summaryResult.error) {
        setError(pageResult.error?.message || summaryResult.error?.message || "Unable to load leads.");
        setLeads([]);
      } else {
        setLeads((pageResult.data ?? []) as StoreLeadListItem[]);
        setSummary((summaryResult.data ?? summary) as StoreLeadSummary);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [profileId, profileRole, debouncedSearch, typeFilter, statusFilter, ownerFilter, includeArchived, page]);

  const assigneeMap = useMemo(
    () => new Map(assignees.map((item) => [item.id, item.full_name || item.email || "Unknown user"])),
    [assignees],
  );
  const total = leads[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canManageAllOwners = profileRole === "super_admin" || profileRole === "admin";

  if (error && !profileId) {
    return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-300">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active Leads", summary.total],
          ["New", summary.new],
          ["Dealer Applications", summary.dealer_applications],
          ["Qualified / Approved", summary.qualified_or_approved],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_210px_210px_230px_auto] xl:items-end">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Search</span>
            <input className={inputClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, name, company or email" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
            <select className={inputClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | StoreLeadType)}>
              <option value="all">All Types</option>
              <option value="contact">Contact / Consultation</option>
              <option value="dealer_application">Dealer Application</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | StoreLeadStatus)}>
              <option value="all">All Statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Owner</span>
            <select className={inputClass} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="all">Accessible Leads</option>
              <option value="mine">Assigned to Me</option>
              <option value="unassigned">Unassigned</option>
              {canManageAllOwners ? assignees.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email || item.id}</option>) : null}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            Include archived
          </label>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div> : null}
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
              {!loading ? leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-4 font-medium text-gray-800 dark:text-white/90">{lead.reference_code}{lead.archived_at ? <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">Archived</span> : null}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-300">{typeLabel(lead)}</td>
                  <td className="px-4 py-4"><div className="font-medium text-gray-800 dark:text-white/90">{lead.first_name} {lead.last_name}</div><div className="text-xs text-gray-500">{lead.email}</div></td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{lead.company_name || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(lead.status)}`}>{statusLabels[lead.status]}</span></td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{lead.assigned_to ? assigneeMap.get(lead.assigned_to) || "Assigned" : "Unassigned"}</td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{lead.utm_source || lead.source || "website"}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-500">{formatDateTime(lead.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right"><Link href={`/store/leads/${lead.id}`} className="font-medium text-brand-500 hover:text-brand-600">Open →</Link></td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
        {loading ? <div className="p-10 text-center text-sm text-gray-500">Loading Store leads...</div> : null}
        {!loading && leads.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No leads match the current filters.</div> : null}
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 text-sm text-gray-500 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{total} matching lead{total === 1 ? "" : "s"} · Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 disabled:opacity-40 dark:border-gray-700" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 disabled:opacity-40 dark:border-gray-700" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
