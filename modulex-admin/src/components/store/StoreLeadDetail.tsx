"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  ADMIN_COMPAT_APPEARANCE,
  ADMIN_STATUS_TONES,
  ADMIN_SURFACE_CARD,
  ADMIN_TEXT_STYLES,
} from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import type {
  StoreLead,
  StoreLeadActivity,
  StoreLeadConversion,
  StoreLeadDetailPayload,
  StoreLeadStatus,
} from "@/lib/store/leads";
import { formatDateTime, formatTimestampDate } from "@/lib/dates/usDate";

const cardClass = `${ADMIN_SURFACE_CARD} p-5 sm:p-6`;
const panelClass = `${ADMIN_SURFACE_CARD} p-3`;
const activityCardClass = `${ADMIN_SURFACE_CARD} p-3 text-sm`;
const linkClass = `text-sm font-medium ${ADMIN_COMPAT_APPEARANCE["text-brand-500"]} ${ADMIN_COMPAT_APPEARANCE["hover:text-brand-600"]}`;
const errorClass = `${ADMIN_STATUS_TONES.light.error} mt-4 px-4 py-3 text-sm`;
const successClass = `${ADMIN_STATUS_TONES.light.success} mt-4 px-4 py-3 text-sm`;
const warningTextClass = `text-xs ${ADMIN_COMPAT_APPEARANCE["text-warning-600"]}`;

const statusLabels: Record<StoreLeadStatus, string> = {
  new: "New",
  under_review: "Under Review",
  contacted: "Contacted",
  qualified: "Qualified",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

type ConversionResult = {
  ok: boolean;
  created?: boolean;
  reason?: string;
  target?: "customer" | "project" | "dealer";
  customer_id?: string;
  project_id?: string;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className={`text-xs font-semibold uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>{label}</dt>
      <dd className={`mt-1 break-words text-sm ${ADMIN_TEXT_STYLES.strong}`}>{value || "—"}</dd>
    </div>
  );
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
  const ownerOptions = useMemo(() => assignees.map((item) => ({
    value: item.id,
    label: `${item.full_name || item.email || item.id} (${item.role})`,
  })), [assignees]);

  if (loading) return <div className={cardClass}>Loading lead...</div>;
  if (!lead) return <div className={`${ADMIN_STATUS_TONES.light.error} p-5 text-sm`}>{error || "Lead not available."}</div>;

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
        <div>
          <Link href="/store/leads" className={linkClass}>← Back to Leads</Link>
          <h1 className={`mt-2 text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{lead.reference_code}</h1>
          <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>{leadLabel} · Received {formatDateTime(lead.created_at)}{archived ? " · Archived" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveWorkflow} disabled={busy || archived}>{busy ? "Working..." : "Save Workflow"}</Button>
          {canArchive ? <Button variant={archived ? "outline" : "danger"} onClick={toggleArchive} disabled={busy}>{archived ? "Restore Lead" : "Archive Lead"}</Button> : null}
        </div>
      </div>
      {error ? <div className={errorClass}>{error}</div> : null}
      {success ? <div className={successClass}>{success}</div> : null}
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <div className="space-y-5">
        <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Contact</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Name" value={`${lead.first_name} ${lead.last_name}`} />
            <DetailRow label="Email" value={<a className={linkClass} href={`mailto:${lead.email}`}>{lead.email}</a>} />
            <DetailRow label="Phone" value={lead.phone} />
            <DetailRow label="Location" value={[lead.city, lead.country_code].filter(Boolean).join(", ")} />
          </dl>
        </section>
        {consultation ? <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Project Consultation</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Project Type" value={lead.project_type} />
            <DetailRow label="Consultation Intent" value={lead.consultation_intent} />
            <DetailRow label="Project Address" value={lead.project_address} />
            <DetailRow label="Project City" value={lead.project_city} />
            <DetailRow label="ZIP / Postal Code" value={lead.project_postal_code} />
            <DetailRow label="Preferred Date" value={dateOnly(lead.preferred_consultation_date)} />
          </dl>
        </section> : null}
        {dealer ? <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Dealer Application</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Company" value={lead.company_name} />
            <DetailRow label="Website" value={lead.company_website ? <a className={linkClass} href={lead.company_website} target="_blank" rel="noreferrer">{lead.company_website}</a> : null} />
            <DetailRow label="Business Type" value={lead.business_type} />
            <DetailRow label="Showroom" value={lead.has_showroom == null ? "—" : lead.has_showroom ? "Yes" : "No"} />
            <DetailRow label="Annual Volume" value={lead.estimated_annual_volume} />
            <DetailRow label="Sales Channels" value={lead.sales_channels?.join(", ")} />
            <DetailRow label="Product Interests" value={lead.product_interests?.join(", ")} />
          </dl>
        </section> : null}
        <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Message</h2>
          <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${ADMIN_TEXT_STYLES.body}`}>{lead.message || "No message provided."}</p>
        </section>
        <section className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Attribution & Consent</h2>
              <p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>Sensitive acquisition evidence is DB-redacted for roles that do not need it.</p>
            </div>
            <Badge size="sm" color="light">{role || "Unknown role"}</Badge>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailRow label="Source" value={lead.utm_source || lead.source} />
            <DetailRow label="Medium" value={lead.utm_medium} />
            <DetailRow label="Campaign" value={lead.utm_campaign} />
            <DetailRow label="Content" value={lead.utm_content ?? "Restricted / not captured"} />
            <DetailRow label="Term" value={lead.utm_term ?? "Restricted / not captured"} />
            <DetailRow label="Landing Page" value={lead.landing_page ?? "Restricted / not captured"} />
            <DetailRow label="Referrer" value={lead.referrer ?? "Restricted / not captured"} />
            <DetailRow label="Marketing Consent" value={lead.marketing_consent == null ? "Restricted" : lead.marketing_consent ? "Yes" : "No"} />
          </dl>
        </section>
      </div>

      <div className="space-y-5">
        <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Workflow</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="lead-workflow-status">Status</Label>
              <Select id="lead-workflow-status" options={statusOptions} value={status} onChange={(value) => setStatus(value as StoreLeadStatus)} disabled={busy || archived} />
            </div>
            <div>
              <Label htmlFor="lead-workflow-owner">Owner</Label>
              <Select id="lead-workflow-owner" options={ownerOptions} placeholder="Unassigned" allowEmpty value={assignedTo} onChange={setAssignedTo} disabled={busy || archived} />
            </div>
            <div>
              <Label htmlFor="lead-internal-summary">Internal Summary</Label>
              <TextArea id="lead-internal-summary" rows={5} value={internalNotes} maxLength={5000} onChange={setInternalNotes} disabled={busy || archived} />
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Operator Note</h2>
          <p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>Notes are appended to the immutable activity stream.</p>
          <TextArea className="mt-4" rows={5} value={newNote} maxLength={5000} onChange={setNewNote} disabled={busy || archived} placeholder="Add a call, follow-up, or review note..." />
          <Button className="mt-3" variant="outline" onClick={addNote} disabled={busy || archived || !newNote.trim()}>Add Note</Button>
        </section>

        <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Conversion</h2>
          <p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>Conversions reuse canonical Customer identity by normalized email and are retry-safe. Dealer portal onboarding is not performed here.</p>
          <div className="mt-4 space-y-3">
            {!dealer ? <>
              <div className={panelClass}>
                <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>{customerConversion ? "Customer conversion complete." : "Create or reuse a canonical Customer."}</p>
                {customerConversion?.customer_id ? <Link className={`mt-2 inline-block ${linkClass}`} href={`/customers/${customerConversion.customer_id}`}>View Customer →</Link> : <Button className="mt-3" onClick={() => convert("customer")} disabled={busy || archived || !ready}>Convert to Customer</Button>}
              </div>
              <div className={panelClass}>
                <Label htmlFor="lead-project-name">Project name</Label>
                <Input id="lead-project-name" className="mt-2" value={projectName} maxLength={200} onChange={(event) => setProjectName(event.target.value)} disabled={busy || archived || Boolean(projectConversion)} />
                {projectConversion?.project_id ? <Link className={`mt-2 inline-block ${linkClass}`} href={`/projects/${projectConversion.project_id}`}>View Project →</Link> : <Button className="mt-3" onClick={() => convert("project")} disabled={busy || archived || !ready || !projectName.trim()}>Create Project</Button>}
              </div>
            </> : null}
            {dealer ? <div className={panelClass}>
              <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Creates or reuses the canonical Dealer-type Customer only. Portal activation remains a separate controlled workflow.</p>
              {dealerConversion?.customer_id ? <Link className={`mt-2 inline-block ${linkClass}`} href={`/customers/${dealerConversion.customer_id}`}>View Dealer Customer →</Link> : <Button className="mt-3" onClick={() => convert("dealer")} disabled={busy || archived || lead.status !== "approved"}>Create Dealer Customer</Button>}
            </div> : null}
            {!dealer && !ready && !conversionTargets.size ? <p className={warningTextClass}>Qualify or approve this lead before conversion.</p> : null}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Activity</h2>
          <div className="mt-4 space-y-3">
            {activity.map((item) => <div key={item.id} className={activityCardClass}>
              <div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{activityLabel(item)}</div>
              {item.from_status || item.to_status ? <div className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>{item.from_status || "—"} → {item.to_status || "—"}</div> : null}
              {item.note ? <p className={`mt-2 whitespace-pre-wrap ${ADMIN_TEXT_STYLES.body}`}>{item.note}</p> : null}
              <div className={`mt-2 text-xs ${ADMIN_TEXT_STYLES.muted}`}>{formatDateTime(item.created_at)}</div>
            </div>)}
            {activity.length === 0 ? <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>No activity recorded.</p> : null}
          </div>
        </section>
      </div>
    </div>
  </div>;
}