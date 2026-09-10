"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dates/usDate";

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
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
    return fetch(input, { ...init, headers, cache: "no-store" });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await request("/api/admin/email-notifications/monitor?limit=150");
      const responseBody = (await response.json()) as { deliveries?: DeliveryRow[]; error?: string };
      if (!response.ok) throw new Error(responseBody.error || "Delivery monitor could not be loaded.");
      setRows(responseBody.deliveries ?? []);
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
      const responseBody = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(responseBody.error || "Retry could not be scheduled.");
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
      const responseBody = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(responseBody.error || "Queue processing failed.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Queue processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Email Deliveries" />

      <ComponentCard
        title="Delivery operations"
        desc="Sanitized queue health, failure diagnostics and bounded retry controls. Recipient addresses, provider message IDs and payload contents are intentionally hidden."
        headerAction={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
            <Button size="sm" onClick={() => void processQueue()} disabled={processing}>
              {processing ? "Processing…" : "Process queue"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ComponentCard title="Failed"><strong>{counts.failed}</strong></ComponentCard>
          <ComponentCard title="Stuck"><strong>{counts.stuck}</strong></ComponentCard>
          <ComponentCard title="Pending"><strong>{counts.pending}</strong></ComponentCard>
        </div>

        {error ? <ComponentCard title="Delivery monitor error" desc={error} /> : null}

        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Event</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Attempts</TableCell>
                <TableCell isHeader variant="admin">Failure</TableCell>
                <TableCell isHeader variant="admin">Updated</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin" aria-busy={loading}>
              {loading ? (
                <TableStateRow colSpan={6}>Loading delivery status…</TableStateRow>
              ) : rows.length === 0 ? (
                <TableStateRow colSpan={6}>No email delivery rows found.</TableStateRow>
              ) : rows.map((row) => {
                const retryable = (row.status === "failed" || row.is_stuck) && !row.is_exhausted && row.attempts < row.max_attempts;
                return (
                  <TableRow key={row.id}>
                    <TableCell variant="admin">
                      <div>{label(row.event_type)}</div>
                      <div>{label(row.audience)} · {label(row.entity_type)}</div>
                    </TableCell>
                    <TableCell variant="admin">
                      <div className="flex flex-wrap gap-2">
                        <Badge size="sm">{row.is_stuck ? "Stuck" : label(row.status)}</Badge>
                        {row.is_exhausted ? <Badge size="sm">Retry budget exhausted</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell variant="admin">{row.attempts} / {row.max_attempts}</TableCell>
                    <TableCell variant="admin">
                      <div>{row.failure_code ? label(row.failure_code) : "—"}</div>
                      <div>{row.failure_reason || "No failure recorded."}</div>
                    </TableCell>
                    <TableCell variant="admin">{formatDateTime(row.updated_at)}</TableCell>
                    <TableCell variant="admin" className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void retry(row)}
                        disabled={!retryable || retrying === row.id}
                      >
                        {retrying === row.id ? "Retrying…" : "Retry"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>
    </div>
  );
}
