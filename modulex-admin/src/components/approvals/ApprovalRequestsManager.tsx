"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";

type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
type ApprovalRow = {
  id: string;
  request_type: string;
  entity_type: "order" | "customer" | "invoice";
  entity_id: string;
  entity_label: string | null;
  status: ApprovalStatus;
  request_reason: string | null;
  current_snapshot: Record<string, unknown>;
  proposed_changes: Record<string, unknown>;
  risk_summary: Record<string, unknown>;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null };
type EntityLink = { href: string; label: string };

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusClass(status: ApprovalStatus) {
  if (status === "approved") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "rejected") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "pending") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function reasonRows(row: ApprovalRow) {
  const reasons = row.risk_summary?.reasons;
  return Array.isArray(reasons) ? (reasons as Array<Record<string, unknown>>) : [];
}

function warningRows(row: ApprovalRow) {
  const warnings = row.risk_summary?.warnings;
  return Array.isArray(warnings) ? (warnings as Array<Record<string, unknown>>) : [];
}

function proposedSummary(row: ApprovalRow) {
  const p = row.proposed_changes ?? {};
  if (row.request_type === "order_status_change") {
    return p.status ? `Requested status: ${titleCase(String(p.status))}` : "Status change";
  }
  if (row.request_type === "invoice_change") {
    const parts = [p.status ? `Status: ${titleCase(String(p.status))}` : null, p.paid_amount != null ? `Paid amount: ${p.paid_amount}` : null].filter(Boolean);
    return parts.join(" · ") || "Invoice change";
  }
  if (row.request_type === "customer_commercial_change") {
    const parts = [
      p.credit_limit != null ? `Credit limit: ${p.credit_limit}` : null,
      p.payment_term_id ? "Payment terms changed" : null,
      p.credit_hold === false ? "Credit hold release" : null,
      p.tax_exempt === true ? "Tax exempt" : null,
    ].filter(Boolean);
    return parts.join(" · ") || "Commercial settings change";
  }
  if (row.request_type === "customer_price_group_change") return "Customer default price group change is waiting for approval.";
  if (row.request_type === "order_revision") return "Proposed revision is waiting; the live order has not been changed.";
  if (row.request_type === "order_exception") return "Draft order contains an exception that must be approved before confirmation.";
  return "Approval required";
}

export default function ApprovalRequestsManager() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [links, setLinks] = useState<Record<string, EntityLink>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | ApprovalStatus>("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setErrorMessage(profileError?.message || "Active staff profile is required.");
      setIsLoading(false);
      return;
    }
    setRole(profile.role);

    const [requestsResult, profilesResult] = await Promise.all([
      supabase.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(150),
      supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
    ]);
    if (requestsResult.error) {
      setErrorMessage(requestsResult.error.message);
      setIsLoading(false);
      return;
    }

    const nextRows = (requestsResult.data ?? []) as ApprovalRow[];
    setRows(nextRows);
    setProfiles((profilesResult.data ?? []) as ProfileRow[]);

    const orderIds = nextRows.filter((item) => item.entity_type === "order").map((item) => item.entity_id);
    const invoiceIds = nextRows.filter((item) => item.entity_type === "invoice").map((item) => item.entity_id);
    const [ordersResult, invoicesResult] = await Promise.all([
      orderIds.length ? supabase.from("customer_orders").select("id, customer_id, order_number").in("id", orderIds) : Promise.resolve({ data: [] }),
      invoiceIds.length ? supabase.from("customer_invoices").select("id, customer_id, invoice_number").in("id", invoiceIds) : Promise.resolve({ data: [] }),
    ]);
    const nextLinks: Record<string, EntityLink> = {};
    for (const item of (ordersResult.data ?? []) as Array<{ id: string; customer_id: string; order_number: string }>) {
      nextLinks[`order:${item.id}`] = { href: `/customers/${item.customer_id}/orders/${item.id}`, label: item.order_number };
    }
    for (const item of (invoicesResult.data ?? []) as Array<{ id: string; customer_id: string; invoice_number: string }>) {
      nextLinks[`invoice:${item.id}`] = { href: `/customers/${item.customer_id}/invoices/${item.id}`, label: item.invoice_number };
    }
    for (const item of nextRows.filter((entry) => entry.entity_type === "customer")) {
      nextLinks[`customer:${item.entity_id}`] = { href: `/customers/${item.entity_id}`, label: item.entity_label || "Customer" };
    }
    setLinks(nextLinks);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.full_name || profile.email || "User"])), [profiles]);
  const canReview = role === "super_admin" || role === "admin";
  const types = useMemo(() => [...new Set(rows.map((row) => row.request_type))], [rows]);
  const filtered = useMemo(() => rows.filter((row) => (statusFilter === "all" || row.status === statusFilter) && (typeFilter === "all" || row.request_type === typeFilter)), [rows, statusFilter, typeFilter]);
  const counts = useMemo(() => ({ pending: rows.filter((row) => row.status === "pending").length, approved: rows.filter((row) => row.status === "approved").length, rejected: rows.filter((row) => row.status === "rejected").length }), [rows]);

  async function review(row: ApprovalRow, decision: "approved" | "rejected") {
    if (!canReview || workingId) return;
    setWorkingId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { data, error } = await supabase.rpc("review_approval_request", {
      p_request_id: row.id,
      p_decision: decision,
      p_note: reviewNotes[row.id]?.trim() || null,
    });
    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }
    setSuccessMessage(data === "approved" ? "Request approved and the authorized change was applied." : "Request rejected; the live record was not changed.");
    setWorkingId(null);
    await load();
  }

  if (isLoading) return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><p className="text-sm text-gray-500">Loading approvals...</p></div>;

  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric label="Pending" value={counts.pending} tone="warning" />
      <Metric label="Approved" value={counts.approved} tone="success" />
      <Metric label="Rejected" value={counts.rejected} tone="error" />
    </div>

    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
    {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{successMessage}</div>}

    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{canReview ? "Approval Queue" : "My Approval Requests"}</h2><p className="mt-1 text-sm text-gray-500">Financial and post-confirmation exceptions are held here before they can affect protected records.</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="pending">Pending</option><option value="all">All statuses</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All request types</option>{types.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select>
          <button type="button" onClick={() => void load()} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Refresh</button>
        </div>
      </div>
    </div>

    {filtered.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">No approval requests match these filters.</div> : <div className="space-y-4">{filtered.map((row) => {
      const reasons = reasonRows(row);
      const warnings = warningRows(row);
      const link = links[`${row.entity_type}:${row.entity_id}`];
      return <article key={row.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}>{titleCase(row.status)}</span><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{titleCase(row.request_type)}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{row.entity_label || titleCase(row.entity_type)}</h3>{link && <Link href={link.href} className="text-sm font-medium text-brand-500 hover:text-brand-600">Open record →</Link>}</div>
            <p className="mt-1 text-sm text-gray-500">Requested by {profileMap.get(row.requested_by) || "User"} · {dateTime(row.requested_at)}</p>
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{row.request_reason || proposedSummary(row)}</p>
            <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{proposedSummary(row)}</p>

            {reasons.length > 0 && <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Approval reasons</p><div className="mt-2 flex flex-wrap gap-2">{reasons.map((reason, index) => <span key={`${String(reason.type)}-${index}`} className="rounded-lg bg-warning-50 px-2.5 py-1.5 text-xs font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">{String(reason.label || titleCase(String(reason.type || "exception")))}{reason.sku ? ` · ${reason.sku}` : ""}</span>)}</div></div>}
            {warnings.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{warnings.map((warning, index) => <span key={`${String(warning.type)}-${index}`} className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">{String(warning.label || warning.type)}</span>)}</div>}

            {row.reviewed_at && <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300"><span className="font-medium">Reviewed by {row.reviewed_by ? profileMap.get(row.reviewed_by) || "Admin" : "Admin"}</span> · {dateTime(row.reviewed_at)}{row.review_note ? <p className="mt-1">{row.review_note}</p> : null}</div>}
          </div>

          {canReview && row.status === "pending" && <div className="w-full shrink-0 xl:w-80"><label className="text-xs font-medium text-gray-500">Review note</label><textarea value={reviewNotes[row.id] || ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Optional approval/rejection note" className="mt-1 min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" /><div className="mt-2 grid grid-cols-2 gap-2"><button disabled={workingId === row.id} onClick={() => void review(row, "rejected")} className="h-10 rounded-lg border border-error-300 text-sm font-medium text-error-600 disabled:opacity-50">Reject</button><button disabled={workingId === row.id} onClick={() => void review(row, "approved")} className="h-10 rounded-lg bg-success-600 text-sm font-medium text-white disabled:opacity-50">{workingId === row.id ? "Applying..." : "Approve"}</button></div></div>}
        </div>
      </article>;
    })}</div>}
  </div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "error" }) {
  const toneClass = tone === "warning" ? "text-warning-600" : tone === "success" ? "text-success-600" : "text-error-600";
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><p className="text-sm text-gray-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</p></div>;
}
