"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  event_type: string;
  audience: "customer" | "internal";
  entity_type: "order" | "invoice";
  entity_id: string;
  status: "pending" | "processing" | "sent" | "failed" | "skipped";
  attempts: number;
  to_emails: string[];
  resend_message_ids: string[];
  last_error: string | null;
  next_attempt_at: string;
  sent_at: string | null;
  created_at: string;
};

type Stats = { pending: number; processing: number; sent: number; failed: number; skipped: number; total: number };

const statusClass: Record<NotificationRow["status"], string> = {
  pending: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
  processing: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
  sent: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
  failed: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
  skipped: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400",
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function EmailNotificationQueueManager() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0, total: 0 });
  const [status, setStatus] = useState("all");
  const [audience, setAudience] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perPage = 25;

  async function authFetch(url: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), perPage: String(perPage) });
      if (status !== "all") params.set("status", status);
      if (audience !== "all") params.set("audience", audience);
      if (eventType !== "all") params.set("event_type", eventType);
      const payload = await authFetch(`/api/admin/email-notifications?${params.toString()}`);
      setRows(payload.notifications ?? []);
      setStats(payload.stats ?? stats);
      setTotal(payload.total ?? 0);
      setPage(nextPage);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Email queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(1); }, [status, audience, eventType]);

  async function action(id: string, actionName: "retry" | "skip") {
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/email-notifications", { method: "PATCH", body: JSON.stringify({ id, action: actionName }) });
      await load(page);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Notification could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function processQueue() {
    setBusy(true);
    setError(null);
    try {
      await authFetch("/api/admin/email-notifications/process", { method: "POST", body: JSON.stringify({ limit: 50 }) });
      await load(1);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Queue could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  const eventTypes = useMemo(() => ["new_order", "order_confirmed", "order_status_changed", "stock_review_required", "price_review_required", "invoice_issued"], []);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Email Queue & Delivery Log</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Monitor transactional email delivery, retry failed items and manually process pending notifications.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/settings/general" className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Back to General Settings</Link><button type="button" onClick={processQueue} disabled={busy} className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busy ? "Working..." : "Process Queue Now"}</button></div>
    </div>

    {error && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {([['Total', stats.total], ['Pending', stats.pending], ['Processing', stats.processing], ['Sent', stats.sent], ['Failed', stats.failed], ['Skipped', stats.skipped]] as Array<[string, number]>).map(([name, value]) => <div key={name} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs font-medium uppercase tracking-wide text-gray-400">{name}</p><p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p></div>)}
    </div>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="grid gap-3 md:grid-cols-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All statuses</option>{["pending","processing","sent","failed","skipped"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
        <select value={audience} onChange={(e) => setAudience(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All audiences</option><option value="customer">Customer</option><option value="internal">Internal</option></select>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">All event types</option>{eventTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400"><tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Recipients</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Details</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">Loading email queue...</td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">No email notifications match these filters.</td></tr> : rows.map((row) => <tr key={row.id} className="align-top"><td className="whitespace-nowrap px-4 py-4 text-gray-500">{dateTime(row.created_at)}</td><td className="px-4 py-4"><p className="font-medium text-gray-800 dark:text-white/90">{label(row.event_type)}</p><p className="mt-1 text-xs text-gray-400">{row.entity_type}</p></td><td className="px-4 py-4 text-gray-600 dark:text-gray-300">{label(row.audience)}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[row.status]}`}>{label(row.status)}</span>{row.sent_at && <p className="mt-1 text-[11px] text-gray-400">{dateTime(row.sent_at)}</p>}</td><td className="max-w-60 px-4 py-4 text-xs text-gray-500">{Array.isArray(row.to_emails) && row.to_emails.length ? row.to_emails.join(", ") : "—"}</td><td className="px-4 py-4 text-gray-600">{row.attempts}</td><td className="max-w-72 px-4 py-4"><p className="break-words text-xs text-gray-500">{row.last_error || (row.resend_message_ids?.length ? `Resend: ${row.resend_message_ids.join(", ")}` : "—")}</p></td><td className="px-4 py-4"><div className="flex justify-end gap-2">{row.status !== "sent" && <button type="button" disabled={busy || row.status === "processing"} onClick={() => action(row.id, "retry")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Retry</button>}{!["sent","skipped"].includes(row.status) && <button type="button" disabled={busy || row.status === "processing"} onClick={() => action(row.id, "skip")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 disabled:opacity-50 dark:border-gray-700">Skip</button>}</div></td></tr>)}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800"><span className="text-gray-500">Page {page} of {pages} · {total} records</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40 dark:border-gray-700">Previous</button><button disabled={page >= pages || loading} onClick={() => void load(page + 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40 dark:border-gray-700">Next</button></div></div>
    </section>
  </div>;
}
