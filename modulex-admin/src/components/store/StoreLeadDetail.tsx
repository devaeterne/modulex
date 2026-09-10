"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import type {
  StoreLead,
  StoreLeadActivity,
  StoreLeadConversion,
  StoreLeadDetailPayload,
  StoreLeadStatus,
} from "@/lib/store/leads";
import { formatDateTime, formatTimestampDate } from "@/lib/dates/usDate";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClass = `${inputClass} h-auto min-h-28`;
const primaryButton = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const secondaryButton = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const dangerButton = "inline-flex h-10 items-center justify-center rounded-lg border border-error-300 bg-white px-4 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:bg-gray-900";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6";

const statusLabels: Record<StoreLeadStatus, string> = {
  new: "New",
  under_review: "Under Review",
  contacted: "Contacted",
  qualified: "Qualified",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

type ConversionResult = {
  ok: boolean;
  created?: boolean;
  reason?: string;
  target?: "customer" | "project" | "dealer";
  customer_id?: string;
  project_id?: string;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 break-words text-sm text-gray-800 dark:text-white/90">{value || "—"}</dd></div>;
}

function dateOnly(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : formatTimestampDate(parsed, { timeZone: "UTC" });
}

function activityLabel(item: StoreLeadActivity) {
  const labels: Record<string, string> = {
    created: "Lead created",
    status_changed: "Status changed",
    assignment_changed: "Assignment changed",
    internal_notes_updated: "Internal note summary updated",
    note_added: "Operator note",
    archived: "Lead archived",
    restored: "Lead restored",
    converted_to_customer: "Converted to customer",
    converted_to_project: "Converted to project",
    linked_to_existing_dealer: "Linked to existing dealer",
  };
  return labels[item.action] || item.action.replaceAll("_", " ");
}

export default function StoreLeadDetail({ id }: { id: string }) {
  const [lead, setLead] = useState<StoreLead | null>(null);
  const [activity, setActivity] = useState<StoreLeadActivity[]>([]);
  const [conversions, setConversions] = useState<StoreLeadConversion[]>([]);
  const [assignees, setAssignees] = useState<NonNullable<StoreLeadDetailPayload["assignees"]>>([]);
  const [role, setRole] = useState<string | null>(null);
  const [canArchive, setCanArchive] = useState(false);
  const [status, setStatus] = useState<StoreLeadStatus>("new");
  const [assignedTo, setAssignedTo] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [newNote, setNewNote] = useState("");
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const applyPayload = useCallback((payload: StoreLeadDetailPayload | null) => {
    if (!payload?.ok || !payload.lead) {
      setError(payload?.reason === "lead_not_found" ? "Lead not found or not available to your role." : "Unable to load lead.");
      return false;
    }
    setLead(payload.lead);
    setActivity(payload.activity ?? []);
    setConversions(payload.conversions ?? []);
    setAssignees(payload.assignees ?? []);
    setRole(payload.role ?? null);
    setCanArchive(Boolean(payload.can_archive));
    setStatus(payload.lead.status);
    setAssignedTo(payload.lead.assigned_to || "");
    setInternalNotes(payload.lead.internal_notes || "");
    setProjectName((current) => current || `${payload.lead.company_name || `${payload.lead.first_name} ${payload.lead.last_name}`} Project`);
    return true;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("get_store_lead_detail", { p_lead_id: id });
    if (rpcError) setError(rpcError.message);
    else applyPayload(data as StoreLeadDetailPayload | null);
    setLoading(false);
  }, [id, applyPayload]);

  useEffect(() => { void load(); }, [load]);

  async function saveWorkflow() {
    if (!lead) return;
    setBusy(true); setError(null); setSuccess(null);
    const { data, error: rpcError } = await supabase.rpc("update_store_lead_workflow", {
      p_lead_id: lead.id,
      p_status: status,
      p_assigned_to: assignedTo || null,
      p_internal_notes: internalNotes.trim() || null,
    });
    if (rpcError) setError(rpcError.message);
    else if (applyPayload(data as StoreLeadDetailPayload | null)) setSuccess("Lead workflow updated.");
    setBusy(false);
  }

  async function addNote() {
    if (!lead || !newNote.trim()) return;
    setBusy(true); setError(null); setSuccess(null);
    const { data, error: rpcError } = await supabase.rpc("add_store_lead_note", { p_lead_id: lead.id, p_note: newNote.trim() });
    if (rpcError) setError(rpcError.message);
    else if (applyPayload(data as StoreLeadDetailPayload | null)) { setNewNote(""); setSuccess("Operator note added to activity."); }
    setBusy(false);
  }

  async function toggleArchive() {
    if (!lead || !canArchive) return;
    setBusy(true); setError(null); setSuccess(null);
    const archive = !lead.archived_at;
    const { data, error: rpcError } = await supabase.rpc("set_store_lead_archived", {
      p_lead_id: lead.id,
      p_archived: archive,
      p_note: archive ? "Archived from Lead workspace" : "Restored to active Lead workspace",
    });
    if (rpcError) setError(rpcError.message);
    else if (applyPayload(data as StoreLeadDetailPayload | null)) setSuccess(archive ? "Lead archived." : "Lead restored.");
    setBusy(false);
  }

  async function convert(target: "customer" | "project" | "dealer") {
    if (!lead) return;
    setBusy(true); setError(null); setSuccess(null);
    const { data, error: rpcError } = await supabase.rpc("convert_store_lead", {
      p_lead_id: lead.id,
      p_target: target,
      p_idempotency_key: crypto.randomUUID(),
      p_project_name: target === "project" ? projectName.trim() : null,
    });
    if (rpcError) { setError(rpcError.message); setBusy(false); return; }
    const result = data as ConversionResult | null;
    if (!result?.ok) {
      const messages: Record<string, string> = {
        lead_not_ready: "Move the lead to Qualified or Approved before conversion.",
        lead_not_approved: "Dealer applications must be Approved before dealer conversion.",
        lead_archived: "Restore the lead before conversion.",
        not_dealer_application: "Only dealer applications can become dealer customers.",
        ambiguous_customer_identity: "More than one customer matches this email. Resolve the customer identity before converting.",
        existing_customer_not_dealer: "A matching Customer already exists but is not a Dealer customer. Review that customer instead of creating a duplicate identity.",
      };
      setError(messages[result?.reason || ""] || "Lead conversion could not be completed.");
      setBusy(false);
      return;
    }
    setSuccess(result.reason === "already_converted" || result.reason === "idempotent_replay" ? "This conversion already exists; the existing identity was reused." : "Lead conversion completed.");
    await load();
    setBusy(false);
  }

  const conversionTargets = useMemo(() => new Set(conversions.map((item) => item.conversion_target)), [conversions]);

  if (loading) return <div className={cardClass}>Loading lead...</div>;
  if (!lead) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700">{error || "Lead not available."}</div>;

  const dealer = lead.lead_type === "dealer_application";
  const consultation = lead.lead_type === "contact" && lead.request_kind === "project_consultation";
  const archived = Boolean(lead.archived_at);
  const ready = ["qualified", "approved", "closed"].includes(lead.status);
  const leadLabel = dealer ? "Dealer Application" : consultation ? "Project Consultation" : "Contact Inquiry";
  const customerConversion = conversions.find((item) => item.conversion_target === "customer");
  const projectConversion = conversions.find((item) => item.conversion_target === "project");
  const dealerConversion = conversions.find((item) => item.conversion_target === "dealer");

  return <div className="space-y-5">
    <section className={cardClass}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><Link href="/store/leads" className="text-sm font-medium text-brand-500">← Back to Leads</Link><h1 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{lead.reference_code}</h1><p className="mt-1 text-sm text-gray-500">{leadLabel} · Received {formatDateTime(lead.created_at)}{archived ? " · Archived" : ""}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={primaryButton} onClick={saveWorkflow} disabled={busy || archived}>{busy ? "Working..." : "Save Workflow"}</button>{canArchive ? <button type="button" className={archived ? secondaryButton : dangerButton} onClick={toggleArchive} disabled={busy}>{archived ? "Restore Lead" : "Archive Lead"}</button> : null}</div>
      </div>
      {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div> : null}
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <div className="space-y-5">
        <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Contact</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailRow label="Name" value={`${lead.first_name} ${lead.last_name}`} /><DetailRow label="Email" value={<a className="text-brand-500" href={`mailto:${lead.email}`}>{lead.email}</a>} /><DetailRow label="Phone" value={lead.phone} /><DetailRow label="Location" value={[lead.city, lead.country_code].filter(Boolean).join(", ")} /></dl></section>
        {consultation ? <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Project Consultation</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailRow label="Project Type" value={lead.project_type} /><DetailRow label="Consultation Intent" value={lead.consultation_intent} /><DetailRow label="Project Address" value={lead.project_address} /><DetailRow label="Project City" value={lead.project_city} /><DetailRow label="ZIP / Postal Code" value={lead.project_postal_code} /><DetailRow label="Preferred Date" value={dateOnly(lead.preferred_consultation_date)} /></dl></section> : null}
        {dealer ? <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Dealer Application</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailRow label="Company" value={lead.company_name} /><DetailRow label="Website" value={lead.company_website ? <a className="text-brand-500" href={lead.company_website} target="_blank" rel="noreferrer">{lead.company_website}</a> : null} /><DetailRow label="Business Type" value={lead.business_type} /><DetailRow label="Showroom" value={lead.has_showroom == null ? "—" : lead.has_showroom ? "Yes" : "No"} /><DetailRow label="Annual Volume" value={lead.estimated_annual_volume} /><DetailRow label="Sales Channels" value={lead.sales_channels?.join(", ")} /><DetailRow label="Product Interests" value={lead.product_interests?.join(", ")} /></dl></section> : null}
        <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Message</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{lead.message || "No message provided."}</p></section>
        <section className={cardClass}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-800 dark:text-white/90">Attribution & Consent</h2><p className="mt-1 text-xs text-gray-500">Sensitive acquisition evidence is DB-redacted for roles that do not need it.</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-white/[0.06]">{role}</span></div><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailRow label="Source" value={lead.utm_source || lead.source} /><DetailRow label="Medium" value={lead.utm_medium} /><DetailRow label="Campaign" value={lead.utm_campaign} /><DetailRow label="Content" value={lead.utm_content ?? "Restricted / not captured"} /><DetailRow label="Term" value={lead.utm_term ?? "Restricted / not captured"} /><DetailRow label="Landing Page" value={lead.landing_page ?? "Restricted / not captured"} /><DetailRow label="Referrer" value={lead.referrer ?? "Restricted / not captured"} /><DetailRow label="Marketing Consent" value={lead.marketing_consent == null ? "Restricted" : lead.marketing_consent ? "Yes" : "No"} /></dl></section>
      </div>

      <div className="space-y-5">
        <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Workflow</h2><div className="mt-4 space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as StoreLeadStatus)} disabled={busy || archived}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Owner</span><select className={inputClass} value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} disabled={busy || archived}><option value="">Unassigned</option>{assignees.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email || item.id} ({item.role})</option>)}</select></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Internal Summary</span><textarea className={textareaClass} value={internalNotes} maxLength={5000} onChange={(event) => setInternalNotes(event.target.value)} disabled={busy || archived} /></label></div></section>
        <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Operator Note</h2><p className="mt-1 text-xs text-gray-500">Notes are appended to the immutable activity stream.</p><textarea className={`${textareaClass} mt-4`} value={newNote} maxLength={5000} onChange={(event) => setNewNote(event.target.value)} disabled={busy || archived} placeholder="Add a call, follow-up, or review note..." /><button type="button" className={`${secondaryButton} mt-3`} onClick={addNote} disabled={busy || archived || !newNote.trim()}>Add Note</button></section>
        <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Conversion</h2><p className="mt-1 text-xs text-gray-500">Conversions reuse canonical Customer identity by normalized email and are retry-safe. Dealer portal onboarding is not performed here.</p><div className="mt-4 space-y-3">
          {!dealer ? <><div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800"><p className="text-sm text-gray-600 dark:text-gray-300">{customerConversion ? "Customer conversion complete." : "Create or reuse a canonical Customer."}</p>{customerConversion?.customer_id ? <Link className="mt-2 inline-block text-sm font-medium text-brand-500" href={`/customers/${customerConversion.customer_id}`}>View Customer →</Link> : <button type="button" className={`${primaryButton} mt-3`} onClick={() => convert("customer")} disabled={busy || archived || !ready}>Convert to Customer</button>}</div><div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Project name</label><input className={`${inputClass} mt-2`} value={projectName} maxLength={200} onChange={(event) => setProjectName(event.target.value)} disabled={busy || archived || Boolean(projectConversion)} />{projectConversion?.project_id ? <Link className="mt-2 inline-block text-sm font-medium text-brand-500" href={`/projects/${projectConversion.project_id}`}>View Project →</Link> : <button type="button" className={`${primaryButton} mt-3`} onClick={() => convert("project")} disabled={busy || archived || !ready || !projectName.trim()}>Create Project</button>}</div></> : null}
          {dealer ? <div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800"><p className="text-sm text-gray-600 dark:text-gray-300">Creates or reuses the canonical Dealer-type Customer only. Portal activation remains a separate controlled workflow.</p>{dealerConversion?.customer_id ? <Link className="mt-2 inline-block text-sm font-medium text-brand-500" href={`/customers/${dealerConversion.customer_id}`}>View Dealer Customer →</Link> : <button type="button" className={`${primaryButton} mt-3`} onClick={() => convert("dealer")} disabled={busy || archived || lead.status !== "approved"}>Create Dealer Customer</button>}</div> : null}
          {!dealer && !ready && !conversionTargets.size ? <p className="text-xs text-warning-600">Qualify or approve this lead before conversion.</p> : null}
        </div></section>
        <section className={cardClass}><h2 className="font-semibold text-gray-800 dark:text-white/90">Activity</h2><div className="mt-4 space-y-3">{activity.map((item) => <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm dark:border-gray-800"><div className="font-medium text-gray-800 dark:text-white/90">{activityLabel(item)}</div>{item.from_status || item.to_status ? <div className="mt-1 text-xs text-gray-500">{item.from_status || "—"} → {item.to_status || "—"}</div> : null}{item.note ? <p className="mt-2 whitespace-pre-wrap text-gray-600 dark:text-gray-300">{item.note}</p> : null}<div className="mt-2 text-xs text-gray-400">{formatDateTime(item.created_at)}</div></div>)}{activity.length === 0 ? <p className="text-sm text-gray-500">No activity recorded.</p> : null}</div></section>
      </div>
    </div>
  </div>;
}
