"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { LeadAssignee, StoreLead, StoreLeadActivity, StoreLeadStatus } from "@/lib/store/leads";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClass = `${inputClass} h-auto min-h-32`;
const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";

const statusLabels: Record<StoreLeadStatus, string> = {
  new: "New",
  under_review: "Under Review",
  contacted: "Contacted",
  qualified: "Qualified",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 text-sm text-gray-800 dark:text-white/90">{value || "—"}</dd></div>;
}

export default function StoreLeadDetail({ id }: { id: string }) {
  const [lead, setLead] = useState<StoreLead | null>(null);
  const [activity, setActivity] = useState<StoreLeadActivity[]>([]);
  const [assignees, setAssignees] = useState<LeadAssignee[]>([]);
  const [status, setStatus] = useState<StoreLeadStatus>("new");
  const [assignedTo, setAssignedTo] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const assigneeMap = useMemo(() => new Map(assignees.map((item) => [item.id, item.full_name || item.email || "Unknown user"])), [assignees]);

  async function load() {
    setLoading(true);
    setError(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile || !["super_admin", "admin", "sales"].includes(profile.role)) {
      setError(profileError?.message || "You do not have access to Store leads.");
      setLoading(false);
      return;
    }

    const [leadResult, activityResult, profileResult] = await Promise.all([
      supabase.from("store_leads").select("*").eq("id", id).single(),
      supabase.from("store_lead_activity").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email, role").in("role", ["super_admin", "admin", "sales"]).eq("is_active", true).order("full_name"),
    ]);

    if (leadResult.error || activityResult.error || profileResult.error) {
      setError(leadResult.error?.message || activityResult.error?.message || profileResult.error?.message || "Unable to load lead.");
    } else {
      const loaded = leadResult.data as StoreLead;
      setLead(loaded);
      setStatus(loaded.status);
      setAssignedTo(loaded.assigned_to || "");
      setInternalNotes(loaded.internal_notes || "");
      setActivity((activityResult.data ?? []) as StoreLeadActivity[]);
      setAssignees((profileResult.data ?? []) as LeadAssignee[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [id]);

  async function save() {
    if (!lead) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { data, error: updateError } = await supabase
      .from("store_leads")
      .update({ status, assigned_to: assignedTo || null, internal_notes: internalNotes.trim() || null })
      .eq("id", lead.id)
      .select("*")
      .single();

    if (updateError) {
      setError(updateError.message);
    } else {
      setLead(data as StoreLead);
      setSuccess("Lead updated.");
      const { data: activityData } = await supabase.from("store_lead_activity").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false });
      setActivity((activityData ?? []) as StoreLeadActivity[]);
    }
    setSaving(false);
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading lead...</div>;
  if (error && !lead) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700">{error}</div>;
  if (!lead) return null;

  const dealer = lead.lead_type === "dealer_application";

  return <div className="space-y-5">
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><Link href="/store/leads" className="text-sm font-medium text-brand-500">← Back to Leads</Link><h1 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{lead.reference_code}</h1><p className="mt-1 text-sm text-gray-500">{dealer ? "Dealer Application" : "Contact Inquiry"} · Received {formatDate(lead.created_at)}</p></div>
        <button type="button" className={primaryButton} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Lead"}</button>
      </div>
      {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div> : null}
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Contact</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Name" value={`${lead.first_name} ${lead.last_name}`} />
            <DetailRow label="Email" value={<a className="text-brand-500" href={`mailto:${lead.email}`}>{lead.email}</a>} />
            <DetailRow label="Phone" value={lead.phone} />
            <DetailRow label="Location" value={[lead.city, lead.country_code].filter(Boolean).join(", ")} />
          </dl>
        </section>

        {dealer ? <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Dealer Application</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Company" value={lead.company_name} />
            <DetailRow label="Website" value={lead.company_website ? <a className="text-brand-500" href={lead.company_website} target="_blank" rel="noreferrer">{lead.company_website}</a> : null} />
            <DetailRow label="Business Type" value={lead.business_type} />
            <DetailRow label="Showroom" value={lead.has_showroom == null ? "—" : lead.has_showroom ? "Yes" : "No"} />
            <DetailRow label="Annual Volume" value={lead.estimated_annual_volume} />
            <DetailRow label="Sales Channels" value={lead.sales_channels?.join(", ")} />
            <DetailRow label="Product Interests" value={lead.product_interests?.join(", ")} />
          </dl>
        </section> : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Message</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{lead.message || "No message provided."}</p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Attribution</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Source" value={lead.utm_source || lead.source} /><DetailRow label="Medium" value={lead.utm_medium} /><DetailRow label="Campaign" value={lead.utm_campaign} /><DetailRow label="Content" value={lead.utm_content} /><DetailRow label="Term" value={lead.utm_term} /><DetailRow label="Landing Page" value={lead.landing_page} /><DetailRow label="Referrer" value={lead.referrer} /><DetailRow label="Marketing Consent" value={lead.marketing_consent ? "Yes" : "No"} />
          </dl>
        </section>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Workflow</h2>
          <div className="mt-4 space-y-4">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as StoreLeadStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Assigned To</span><select className={inputClass} value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Unassigned</option>{assignees.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email || item.id} ({item.role})</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Internal Notes</span><textarea className={textareaClass} value={internalNotes} maxLength={5000} onChange={(event) => setInternalNotes(event.target.value)} /></label>
          </div>
          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">Approved leads are not converted into customers automatically. Customer onboarding remains a separate controlled step.</div>
          {lead.converted_customer_id ? <div className="mt-3 text-sm">Linked customer: <Link className="text-brand-500" href={`/customers/${lead.converted_customer_id}`}>{lead.converted_customer_id}</Link></div> : null}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Activity</h2>
          <div className="mt-4 space-y-3">{activity.map((item) => <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm dark:border-gray-800"><div className="font-medium text-gray-800 dark:text-white/90">{item.action === "created" ? "Lead created" : `${item.from_status || "—"} → ${item.to_status || "—"}`}</div><div className="mt-1 text-xs text-gray-500">{formatDate(item.created_at)}{item.actor_user_id ? ` · ${assigneeMap.get(item.actor_user_id) || "Staff"}` : " · Website"}</div></div>)}{activity.length === 0 ? <p className="text-sm text-gray-500">No activity yet.</p> : null}</div>
        </section>
      </div>
    </div>
  </div>;
}
