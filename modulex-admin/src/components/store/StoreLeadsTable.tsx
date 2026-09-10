"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  ADMIN_COMPAT_APPEARANCE,
  ADMIN_STATUS_TONES,
  ADMIN_SURFACE_CARD,
  ADMIN_TEXT_STYLES,
} from "@/components/ui/theme/adminTheme";
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

const pageSize = 25;
const summaryCardClass = `${ADMIN_SURFACE_CARD} p-5`;
const filterCardClass = `${ADMIN_SURFACE_CARD} p-5 sm:p-6`;
const tableCardClass = ADMIN_SURFACE_CARD;
const errorClass = `${ADMIN_STATUS_TONES.light.error} p-5 text-sm`;
const inlineErrorClass = `${ADMIN_STATUS_TONES.light.error} mt-4 px-4 py-3 text-sm`;
const rowHoverClass = `${ADMIN_COMPAT_APPEARANCE["hover:bg-gray-50"]} ${ADMIN_COMPAT_APPEARANCE["dark:hover:bg-white/[0.02]"]}`;
const linkClass = `font-medium ${ADMIN_COMPAT_APPEARANCE["text-brand-500"]} ${ADMIN_COMPAT_APPEARANCE["hover:text-brand-600"]}`;
const footerClass = `flex flex-col gap-3 border-t px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between ${ADMIN_COMPAT_APPEARANCE["border-gray-100"]} ${ADMIN_COMPAT_APPEARANCE["dark:border-gray-800"]} ${ADMIN_TEXT_STYLES.muted}`;

const statusLabels: Record<StoreLeadStatus, string> = {
  new: "New",
  under_review: "Under Review",
  contacted: "Contacted",
  qualified: "Qualified",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

const typeOptions = [
  { value: "all", label: "All Types" },
  { value: "contact", label: "Contact / Consultation" },
  { value: "dealer_application", label: "Dealer Application" },
];
const statusOptions = [
  { value: "all", label: "All Statuses" },
  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
];

function statusColor(status: StoreLeadStatus): "success" | "error" | "warning" | "light" {
  if (status === "approved" || status === "qualified") return "success";
  if (status === "rejected") return "error";
  if (status === "new" || status === "under_review") return "warning";
  return "light";
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
  }, [profileId, profileRole, debouncedSearch, typeFilter, statusFilter, ownerFilter, includeArchived, page, summary]);

  const assigneeMap = useMemo(
    () => new Map(assignees.map((item) => [item.id, item.full_name || item.email || "Unknown user"])),
    [assignees],
  );
  const total = leads[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canManageAllOwners = profileRole === "super_admin" || profileRole === "admin";
  const ownerOptions = useMemo(() => [
    { value: "all", label: "Accessible Leads" },
    { value: "mine", label: "Assigned to Me" },
    { value: "unassigned", label: "Unassigned" },
    ...(canManageAllOwners ? assignees.map((item) => ({ value: item.id, label: item.full_name || item.email || item.id })) : []),
  ], [assignees, canManageAllOwners]);

  if (error && !profileId) {
    return <div className={errorClass}>{error}</div>;
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
          <div key={String(label)} className={summaryCardClass}>
            <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{label}</p>
            <p className={`mt-2 text-2xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className={filterCardClass}>
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_210px_210px_230px_auto] xl:items-end">
          <div>
            <Label htmlFor="lead-search">Search</Label>
            <Input id="lead-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, name, company or email" />
          </div>
          <div>
            <Label htmlFor="lead-type">Type</Label>
            <Select id="lead-type" options={typeOptions} value={typeFilter} onChange={(value) => setTypeFilter(value as "all" | StoreLeadType)} />
          </div>
          <div>
            <Label htmlFor="lead-status">Status</Label>
            <Select id="lead-status" options={statusOptions} value={statusFilter} onChange={(value) => setStatusFilter(value as "all" | StoreLeadStatus)} />
          </div>
          <div>
            <Label htmlFor="lead-owner">Owner</Label>
            <Select id="lead-owner" options={ownerOptions} value={ownerFilter} onChange={setOwnerFilter} />
          </div>
          <div className="flex h-10 items-center">
            <Checkbox label="Include archived" checked={includeArchived} onChange={setIncludeArchived} />
          </div>
        </div>
        {error ? <div className={inlineErrorClass}>{error}</div> : null}
      </section>

      <section className={tableCardClass}>
        <div className="overflow-x-auto">
          <Table variant="admin">
            <TableHeader variant="admin">
              <TableRow>
                {["Reference", "Type", "Contact", "Company", "Status", "Assigned", "Source", "Received", ""].map((heading) => (
                  <TableCell key={heading} isHeader variant="admin" className="px-4 text-left">{heading}</TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody variant="admin" aria-busy={loading}>
              {!loading ? leads.map((lead) => (
                <TableRow key={lead.id} className={rowHoverClass}>
                  <TableCell variant="admin" className="whitespace-nowrap px-4 font-medium">
                    <span className={ADMIN_TEXT_STYLES.strong}>{lead.reference_code}</span>
                    {lead.archived_at ? <span className="ml-2"><Badge size="sm" color="light">Archived</Badge></span> : null}
                  </TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap px-4">{typeLabel(lead)}</TableCell>
                  <TableCell variant="admin" className="px-4">
                    <div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{lead.first_name} {lead.last_name}</div>
                    <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{lead.email}</div>
                  </TableCell>
                  <TableCell variant="admin" className="px-4">{lead.company_name || "—"}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap px-4"><Badge size="sm" color={statusColor(lead.status)}>{statusLabels[lead.status]}</Badge></TableCell>
                  <TableCell variant="admin" className="px-4">{lead.assigned_to ? assigneeMap.get(lead.assigned_to) || "Assigned" : "Unassigned"}</TableCell>
                  <TableCell variant="admin" className="px-4">{lead.utm_source || lead.source || "website"}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap px-4">{formatDateTime(lead.created_at)}</TableCell>
                  <TableCell variant="admin" className="whitespace-nowrap px-4 text-right"><Link href={`/store/leads/${lead.id}`} className={linkClass}>Open →</Link></TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </div>
        {loading ? <div className={`p-10 text-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading Store leads...</div> : null}
        {!loading && leads.length === 0 ? <div className={`p-10 text-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>No leads match the current filters.</div> : null}
        <div className={footerClass}>
          <span>{total} matching lead{total === 1 ? "" : "s"} · Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</Button>
          </div>
        </div>
      </section>
    </div>
  );
}