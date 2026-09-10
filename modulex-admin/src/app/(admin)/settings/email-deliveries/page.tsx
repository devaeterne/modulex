"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type DeliveryRow = {
  id: string;
  event_type: string;
  audience: string;
  entity_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  processing_started_at: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  is_stuck: boolean;
  is_exhausted: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function EmailDeliveriesPage() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const request = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Authentication required.");
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${data.session.access_token}`,
      },
      cache: "no-store",
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await request("/api/admin/email-notifications/monitor?limit=150");
      const payload = (await response.json()) as { deliveries?: DeliveryRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Delivery monitor could not be loaded.");
      setRows(payload.deliveries ?? []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Delivery monitor could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    failed: rows.filter((row) => row.status === "failed").length,
    stuck: rows.filter((row) => row.is_stuck).length,
    pending: rows.filter((row) => row.status === "pending").length,
  }), [rows]);

  async function retry(row: DeliveryRow) {
    setRetrying(row.id);
    setError(null);
    try {
      const response = await request("/api/admin/email-notifications/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: row.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Retry could not be scheduled.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Retry could not be scheduled.");
    } finally {
      setRetrying(null);
    }
  }

  async function processQueue() {
    setProcessing(true);
    setError(null);
    try {
      const response = await request("/api/admin/email-notifications/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Queue processing failed.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Queue processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Email Deliveries</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sanitized queue health, failure diagnostics and bounded retry controls. Recipient addresses, provider message IDs and payload contents are intentionally hidden.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200">
            Refresh
          </button>
          <button type="button" onClick={() => void processQueue()} disabled={processing} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {processing ? "Processing…" : "Process queue"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div className="text-xs uppercase tracking-wide text-gray-500">Failed</div><div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{counts.failed}</div></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div className="text-xs uppercase tracking-wide text-gray-500">Stuck</div><div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{counts.stuck}</div></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><div className="text-xs uppercase tracking-wide text-gray-500">Pending</div><div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{counts.pending}</div></div>
      </div>

      {error && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr><th className="px-4 py-3 text-left font-medium text-gray-500">Event</th><th className="px-4 py-3 text-left font-medium text-gray-500">Status</th><th className="px-4 py-3 text-left font-medium text-gray-500">Attempts</th><th className="px-4 py-3 text-left font-medium text-gray-500">Failure</th><th className="px-4 py-3 text-left font-medium text-gray-500">Updated</th><th className="px-4 py-3 text-right font-medium text-gray-500">Action</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Loading delivery status…</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No email delivery rows found.</td></tr> : rows.map((row) => {
                const retryable = (row.status === "failed" || row.is_stuck) && !row.is_exhausted && row.attempts < row.max_attempts;
                return <tr key={row.id}>
                  <td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-white">{label(row.event_type)}</div><div className="mt-0.5 text-xs text-gray-500">{label(row.audience)} · {label(row.entity_type)}</div></td>
                  <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{row.is_stuck ? "Stuck" : label(row.status)}</span>{row.is_exhausted && <div className="mt-1 text-xs text-error-600">Retry budget exhausted</div>}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.attempts} / {row.max_attempts}</td>
                  <td className="max-w-md px-4 py-3"><div className="text-xs font-medium text-gray-700 dark:text-gray-300">{row.failure_code ? label(row.failure_code) : "—"}</div><div className="mt-1 text-xs leading-5 text-gray-500">{row.failure_reason || "No failure recorded."}</div></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(row.updated_at)}</td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => void retry(row)} disabled={!retryable || retrying === row.id} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">{retrying === row.id ? "Retrying…" : "Retry"}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
