"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/dates/usDate";
import { supabase } from "@/lib/supabase/client";

type LookupOption = { id: string; label: string };
type ImportRow = {
  id: string;
  row_number: number;
  customer: string | null;
  project_name: string | null;
  project_address: string | null;
  start_date: string | null;
  end_date: string | null;
  sales_rep: string | null;
  legacy_initial_contract_price: number | null;
  legacy_price_after_change_orders: number | null;
  legacy_profit_margin: number | null;
  legacy_profit_margin_unit: string | null;
  customer_id: string | null;
  sales_rep_id: string | null;
  target_status: string | null;
  customer_match_count: number;
  sales_rep_match_count: number;
  mapping_status: "unresolved" | "invalid" | "ready" | "committed";
  validation_errors: string[];
  mapping_note: string | null;
  canonical_project_id: string | null;
};

type ImportBatch = {
  id: string;
  source_name: string;
  source_sha256: string;
  status: "staged" | "review" | "ready" | "committed" | "failed";
  row_count: number;
  dry_run_fingerprint: string | null;
  dry_run_at: string | null;
  committed_at: string | null;
};

type Review = { ok?: boolean; batch: ImportBatch; rows: ImportRow[] };
type DryRun = {
  ok?: boolean;
  batch_id: string;
  status: "ready" | "review";
  row_count: number;
  ready_count: number;
  unresolved_count: number;
  invalid_count: number;
  legacy_initial_contract_price_total: number | null;
  legacy_price_after_change_orders_total: number | null;
  legacy_profit_margin_evidence_count: number;
  fingerprint: string;
};

type Inspection = {
  sheet: string;
  sheets: string[];
  headers: string[];
  row_count: number;
};

const PROJECT_STATUSES = [
  ["draft", "Draft"],
  ["quoted", "Quoted"],
  ["approved", "Approved"],
  ["ordered", "Ordered"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
] as const;

function messageFromError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return text.replace(/^PROJECT_IMPORT_/, "").replaceAll("_", " ");
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function StatusPill({ status }: { status: ImportRow["mapping_status"] | ImportBatch["status"] | DryRun["status"] }) {
  const label = status.replaceAll("_", " ");
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
      {label}
    </span>
  );
}

async function requestWithSession(input: BodyInit, contentType?: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Authentication required");
  const headers = new Headers({ Authorization: `Bearer ${data.session.access_token}` });
  if (contentType) headers.set("Content-Type", contentType);
  const response = await fetch("/api/admin/projects/import", {
    method: "POST",
    headers,
    body: input,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
  if (!response.ok) throw new Error(String(payload?.error ?? `Request failed (${response.status})`));
  return payload;
}

function requestJson(body: Record<string, unknown>) {
  return requestWithSession(JSON.stringify(body), "application/json");
}

function MappingEditor({
  row,
  onSaved,
}: {
  row: ImportRow;
  onSaved: () => Promise<void>;
}) {
  const [customerQuery, setCustomerQuery] = useState(row.customer ?? "");
  const [salesQuery, setSalesQuery] = useState(row.sales_rep ?? "");
  const [customerId, setCustomerId] = useState(row.customer_id ?? "");
  const [salesRepId, setSalesRepId] = useState(row.sales_rep_id ?? "");
  const [targetStatus, setTargetStatus] = useState(row.target_status ?? "completed");
  const [note, setNote] = useState(row.mapping_note ?? "Historical import mapping review");
  const [customerOptions, setCustomerOptions] = useState<LookupOption[]>([]);
  const [salesOptions, setSalesOptions] = useState<LookupOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(kind: "customer" | "sales_rep") {
    const query = kind === "customer" ? customerQuery : salesQuery;
    if (query.trim().length < 2) {
      setError("Enter at least 2 characters to search.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await requestJson({ action: "lookup", kind, query });
      const options = Array.isArray(payload.options) ? payload.options as LookupOption[] : [];
      if (kind === "customer") setCustomerOptions(options);
      else setSalesOptions(options);
    } catch (lookupError) {
      setError(messageFromError(lookupError));
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    if (!customerId) {
      setError("Select a customer before saving the mapping.");
      return;
    }
    if (row.sales_rep && !salesRepId) {
      setError("This row contains a Sales Rep. Select the matching user before saving.");
      return;
    }
    if (!note.trim()) {
      setError("A mapping note is required for audit evidence.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestJson({
        action: "mapping",
        row_id: row.id,
        customer_id: customerId,
        sales_rep_id: salesRepId || null,
        target_status: targetStatus,
        note: note.trim(),
      });
      await onSaved();
    } catch (saveError) {
      setError(messageFromError(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Row mapping</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Customer search</label>
          <div className="flex gap-2">
            <input
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              aria-label={`Customer search for row ${row.row_number}`}
            />
            <button type="button" onClick={() => void lookup("customer")} disabled={busy} className="rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700">
              Search
            </button>
          </div>
          {customerOptions.length > 0 ? (
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              aria-label={`Customer match for row ${row.row_number}`}
            >
              <option value="">Select customer</option>
              {customerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          ) : customerId ? <p className="mt-1 text-xs text-gray-500">Existing customer match retained.</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Sales Rep search</label>
          <div className="flex gap-2">
            <input
              value={salesQuery}
              onChange={(event) => setSalesQuery(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              aria-label={`Sales Rep search for row ${row.row_number}`}
            />
            <button type="button" onClick={() => void lookup("sales_rep")} disabled={busy} className="rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700">
              Search
            </button>
          </div>
          {salesOptions.length > 0 ? (
            <select
              value={salesRepId}
              onChange={(event) => setSalesRepId(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              aria-label={`Sales Rep match for row ${row.row_number}`}
            >
              <option value="">No Sales Rep</option>
              {salesOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          ) : salesRepId ? <p className="mt-1 text-xs text-gray-500">Existing Sales Rep match retained.</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Project status</label>
          <select value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            {PROJECT_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Mapping note</label>
          <input value={note} onChange={(event) => setNote(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900" />
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-error-600">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={busy} onClick={() => void saveMapping()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Save Mapping
        </button>
      </div>
    </div>
  );
}

export default function ProjectHistoricalImportManager() {
  const [file, setFile] = useState<File | null>(null);
  const [defaultStatus, setDefaultStatus] = useState("completed");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function upload(mode: "inspect" | "stage") {
    if (!file) {
      setError("Choose an .xlsx workbook first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      form.append("default_status", defaultStatus);
      if (selectedSheet) form.append("sheet", selectedSheet);
      const payload = await requestWithSession(form);
      if (mode === "inspect") {
        const next = payload.inspection as Inspection;
        setInspection(next);
        setSelectedSheet(next.sheet);
        setNotice(`Workbook analyzed: ${next.row_count} importable rows found.`);
      } else {
        setInspection(payload.extraction as Inspection);
        setReview(payload.review as Review);
        setDryRun(payload.dry_run as DryRun);
        setConfirmed(false);
        setNotice("Workbook staged. Review all unresolved or invalid rows before commit.");
      }
    } catch (uploadError) {
      setError(messageFromError(uploadError));
    } finally {
      setBusy(false);
    }
  }

  async function refreshReview(batchId = review?.batch.id) {
    if (!batchId) return;
    const payload = await requestJson({ action: "review", batch_id: batchId });
    setReview(payload as Review);
  }

  async function runDryRun() {
    if (!review?.batch.id) return;
    setBusy(true);
    setError(null);
    try {
      const next = await requestJson({ action: "dry-run", batch_id: review.batch.id }) as DryRun;
      setDryRun(next);
      await refreshReview(review.batch.id);
      setConfirmed(false);
      setNotice(next.status === "ready" ? "Dry Run passed. Review the fingerprint before committing." : "Dry Run found rows that still need review.");
    } catch (runError) {
      setError(messageFromError(runError));
    } finally {
      setBusy(false);
    }
  }

  async function saveMappingRefresh() {
    await refreshReview();
    if (review?.batch.id) {
      const next = await requestJson({ action: "dry-run", batch_id: review.batch.id }) as DryRun;
      setDryRun(next);
      setConfirmed(false);
    }
  }

  async function commitImport() {
    if (!review?.batch.id || !dryRun?.fingerprint || dryRun.status !== "ready" || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson({
        action: "commit",
        batch_id: review.batch.id,
        fingerprint: dryRun.fingerprint,
      });
      await refreshReview(review.batch.id);
      setConfirmed(false);
      setNotice("Historical Project import committed successfully.");
    } catch (commitError) {
      setError(messageFromError(commitError));
    } finally {
      setBusy(false);
    }
  }

  const unresolvedRows = review?.rows.filter((row) => row.mapping_status === "unresolved" || row.mapping_status === "invalid") ?? [];
  const committed = review?.batch.status === "committed";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Historical Project Excel Import</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Admin-only PB-9 workflow. Legacy contract prices and Profit Margin remain reconciliation evidence; they never overwrite canonical Project or Finance truth.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Workbook (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setInspection(null);
                setReview(null);
                setDryRun(null);
                setSelectedSheet("");
              }}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:file:bg-white/[0.08]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Default Project status</label>
            <select value={defaultStatus} onChange={(event) => setDefaultStatus(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
              {PROJECT_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {inspection?.sheets.length ? (
          <div className="mt-4 max-w-md">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Worksheet</label>
            <select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
              {inspection.sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
            </select>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => void upload("inspect")} disabled={busy || !file} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            Analyze Workbook
          </button>
          <button type="button" onClick={() => void upload("stage")} disabled={busy || !file || !inspection} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            Stage &amp; Dry Run
          </button>
        </div>

        {inspection ? (
          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.02] dark:text-gray-400">
            <strong className="text-gray-800 dark:text-white/90">{inspection.row_count}</strong> importable rows · worksheet <strong className="text-gray-800 dark:text-white/90">{selectedSheet || inspection.sheet}</strong>
          </div>
        ) : null}
        {error ? <p className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
        {notice ? <p className="mt-4 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">{notice}</p> : null}
      </section>

      {review && dryRun ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Import Review</h2>
                <StatusPill status={review.batch.status} />
              </div>
              <p className="mt-1 text-sm text-gray-500">{review.batch.source_name} · {review.batch.row_count} rows</p>
            </div>
            {!committed ? (
              <button type="button" onClick={() => void runDryRun()} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-700">
                Run Dry Run
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><p className="text-xs text-gray-500">Ready</p><p className="mt-1 text-xl font-semibold">{dryRun.ready_count}</p></div>
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><p className="text-xs text-gray-500">Unresolved</p><p className="mt-1 text-xl font-semibold">{dryRun.unresolved_count}</p></div>
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><p className="text-xs text-gray-500">Invalid</p><p className="mt-1 text-xl font-semibold">{dryRun.invalid_count}</p></div>
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><p className="text-xs text-gray-500">Margin evidence rows</p><p className="mt-1 text-xl font-semibold">{dryRun.legacy_profit_margin_evidence_count}</p></div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.02]">
              <p className="text-xs text-gray-500">Legacy Initial Contract Price total — evidence only</p>
              <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">{money(dryRun.legacy_initial_contract_price_total)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.02]">
              <p className="text-xs text-gray-500">Legacy Price After Change Orders total — evidence only</p>
              <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">{money(dryRun.legacy_price_after_change_orders_total)}</p>
            </div>
          </div>
        </section>
      ) : null}

      {review && unresolvedRows.length > 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Rows Requiring Mapping</h2>
          <p className="mt-1 text-sm text-gray-500">Resolve customer and Sales Rep matches. Validation errors remain fail-closed.</p>
          <div className="mt-4 space-y-4">
            {unresolvedRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white/90">Row {row.row_number} · {row.project_name || "Missing Project Name"}</p>
                    <p className="mt-1 text-sm text-gray-500">{row.customer || "Missing customer"} · {row.project_address || "No address"}</p>
                    <p className="mt-1 text-xs text-gray-500">Sales Rep: {row.sales_rep || "—"} · Customer matches: {row.customer_match_count} · Sales matches: {row.sales_rep_match_count}</p>
                  </div>
                  <StatusPill status={row.mapping_status} />
                </div>
                {row.validation_errors.length > 0 ? (
                  <p className="mt-3 text-sm text-error-600">Validation: {row.validation_errors.join(", ")}</p>
                ) : null}
                <MappingEditor row={row} onSaved={saveMappingRefresh} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {review ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Row Summary</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800">
                <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Project</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Initial</th><th className="px-3 py-2">After CO</th><th className="px-3 py-2">Margin</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {review.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3">{row.row_number}</td>
                    <td className="px-3 py-3">{row.customer || "—"}</td>
                    <td className="px-3 py-3"><div className="font-medium text-gray-800 dark:text-white/90">{row.project_name || "—"}</div><div className="text-xs text-gray-500">{row.project_address || ""}</div></td>
                    <td className="px-3 py-3"><StatusPill status={row.mapping_status} /></td>
                    <td className="px-3 py-3">{money(row.legacy_initial_contract_price)}</td>
                    <td className="px-3 py-3">{money(row.legacy_price_after_change_orders)}</td>
                    <td className="px-3 py-3">{row.legacy_profit_margin === null ? "—" : `${row.legacy_profit_margin}${row.legacy_profit_margin_unit === "percent" ? "%" : ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {review && dryRun && !committed ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Commit Import</h2><StatusPill status={dryRun.status} /></div>
          <p className="mt-2 text-sm text-gray-500">Commit is allowed only when the current Dry Run is ready. Any mapping change invalidates the prior fingerprint.</p>
          <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.02]">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Exact Dry Run fingerprint</p>
            <code className="mt-2 block break-all text-xs text-gray-800 dark:text-gray-200">{dryRun.fingerprint || "—"}</code>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={dryRun.status !== "ready"} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
            I reviewed the row mappings and evidence totals and want to commit this exact Dry Run.
          </label>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void commitImport()} disabled={busy || dryRun.status !== "ready" || !dryRun.fingerprint || !confirmed} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              Commit Import
            </button>
          </div>
        </section>
      ) : null}

      {committed ? (
        <section className="rounded-2xl border border-success-200 bg-success-50 p-5 text-success-800 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
          <p className="font-semibold">Import committed</p>
          <p className="mt-1 text-sm">{review.batch.committed_at ? `Committed at ${formatDateTime(review.batch.committed_at)}` : "The batch is committed and cannot be committed again."}</p>
        </section>
      ) : null}
    </div>
  );
}
