"use client";

import { useState } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input, { InputNative } from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";
import {
  ADMIN_SURFACE_CARD,
  ADMIN_SURFACE_POPOVER,
  ADMIN_TEXT_STYLES,
} from "@/components/ui/theme/adminTheme";
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

type StatusValue = ImportRow["mapping_status"] | ImportBatch["status"] | DryRun["status"];
type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

const PROJECT_STATUSES = [
  ["draft", "Draft"],
  ["quoted", "Quoted"],
  ["approved", "Approved"],
  ["ordered", "Ordered"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
] as const;

const PROJECT_STATUS_OPTIONS = PROJECT_STATUSES.map(([value, label]) => ({ value, label }));
const CHECKBOX_STYLE = "mt-0.5 h-4 w-4 rounded border-gray-300";

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

function statusColor(status: StatusValue): BadgeColor {
  if (status === "ready" || status === "committed") return "success";
  if (status === "invalid" || status === "failed") return "error";
  if (status === "unresolved" || status === "review") return "warning";
  return "info";
}

function StatusPill({ status }: { status: StatusValue }) {
  return (
    <Badge size="sm" color={statusColor(status)}>
      {status.replaceAll("_", " ")}
    </Badge>
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

function selectOptions(options: LookupOption[], currentId: string, currentLabel: string) {
  const values = new Map<string, string>();
  if (currentId) values.set(currentId, currentLabel || "Current match");
  for (const option of options) values.set(option.id, option.label);
  return Array.from(values, ([value, label]) => ({ value, label }));
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
    <div className={`${ADMIN_SURFACE_POPOVER} mt-4 p-4`}>
      <p className={`${ADMIN_TEXT_STYLES.strong} mb-3 text-sm font-semibold`}>Row mapping</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Label htmlFor={`customer-search-${row.id}`}>Customer search</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input
              id={`customer-search-${row.id}`}
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              ariaLabel={`Customer search for row ${row.row_number}`}
            />
            <Button variant="outline" size="sm" onClick={() => void lookup("customer")} disabled={busy}>
              Search
            </Button>
          </div>
          {(customerOptions.length > 0 || customerId) ? (
            <div className="mt-2">
              <Select
                value={customerId}
                onChange={setCustomerId}
                allowEmpty
                placeholder="Select customer"
                options={selectOptions(customerOptions, customerId, row.customer ?? "Current customer")}
                ariaLabel={`Customer match for row ${row.row_number}`}
              />
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor={`sales-search-${row.id}`}>Sales Rep search</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input
              id={`sales-search-${row.id}`}
              value={salesQuery}
              onChange={(event) => setSalesQuery(event.target.value)}
              ariaLabel={`Sales Rep search for row ${row.row_number}`}
            />
            <Button variant="outline" size="sm" onClick={() => void lookup("sales_rep")} disabled={busy}>
              Search
            </Button>
          </div>
          {(salesOptions.length > 0 || salesRepId) ? (
            <div className="mt-2">
              <Select
                value={salesRepId}
                onChange={setSalesRepId}
                allowEmpty
                placeholder="No Sales Rep"
                options={selectOptions(salesOptions, salesRepId, row.sales_rep ?? "Current Sales Rep")}
                ariaLabel={`Sales Rep match for row ${row.row_number}`}
              />
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor={`status-${row.id}`}>Project status</Label>
          <Select
            id={`status-${row.id}`}
            value={targetStatus}
            onChange={setTargetStatus}
            options={PROJECT_STATUS_OPTIONS}
          />
        </div>
        <div>
          <Label htmlFor={`mapping-note-${row.id}`}>Mapping note</Label>
          <Input
            id={`mapping-note-${row.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      {error ? <div className="mt-3"><Alert variant="error" title="Mapping error" message={error} /></div> : null}
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void saveMapping()}>
          Save Mapping
        </Button>
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
      <section className={`${ADMIN_SURFACE_CARD} p-5`}>
        <div className="mb-5">
          <h2 className={`${ADMIN_TEXT_STYLES.strong} text-lg font-semibold`}>Historical Project Excel Import</h2>
          <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>
            Admin-only PB-9 workflow. Legacy contract prices and Profit Margin remain reconciliation evidence; they never overwrite canonical Project or Finance truth.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Label htmlFor="historical-project-workbook">Workbook (.xlsx)</Label>
            <Input
              id="historical-project-workbook"
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setInspection(null);
                setReview(null);
                setDryRun(null);
                setSelectedSheet("");
              }}
            />
          </div>
          <div>
            <Label htmlFor="historical-default-status">Default Project status</Label>
            <Select
              id="historical-default-status"
              value={defaultStatus}
              onChange={setDefaultStatus}
              options={PROJECT_STATUS_OPTIONS}
            />
          </div>
        </div>

        {inspection?.sheets.length ? (
          <div className="mt-4 max-w-md">
            <Label htmlFor="historical-sheet">Worksheet</Label>
            <Select
              id="historical-sheet"
              value={selectedSheet}
              onChange={setSelectedSheet}
              options={inspection.sheets.map((sheet) => ({ value: sheet, label: sheet }))}
            />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => void upload("inspect")} disabled={busy || !file}>
            Analyze Workbook
          </Button>
          <Button size="sm" onClick={() => void upload("stage")} disabled={busy || !file || !inspection}>
            Stage &amp; Dry Run
          </Button>
        </div>

        {inspection ? (
          <div className={`${ADMIN_SURFACE_POPOVER} mt-4 p-4`}>
            <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>
              <strong className={ADMIN_TEXT_STYLES.strong}>{inspection.row_count}</strong> importable rows · worksheet <strong className={ADMIN_TEXT_STYLES.strong}>{selectedSheet || inspection.sheet}</strong>
            </p>
          </div>
        ) : null}
        {error ? <div className="mt-4"><Alert variant="error" title="Import error" message={error} /></div> : null}
        {notice ? <div className="mt-4"><Alert variant="success" title="Historical import" message={notice} /></div> : null}
      </section>

      {review && dryRun ? (
        <section className={`${ADMIN_SURFACE_CARD} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`${ADMIN_TEXT_STYLES.strong} text-lg font-semibold`}>Import Review</h2>
                <StatusPill status={review.batch.status} />
              </div>
              <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>{review.batch.source_name} · {review.batch.row_count} rows</p>
            </div>
            {!committed ? (
              <Button variant="outline" size="sm" onClick={() => void runDryRun()} disabled={busy}>
                Run Dry Run
              </Button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Ready", dryRun.ready_count],
              ["Unresolved", dryRun.unresolved_count],
              ["Invalid", dryRun.invalid_count],
              ["Margin evidence rows", dryRun.legacy_profit_margin_evidence_count],
            ].map(([label, value]) => (
              <div key={String(label)} className={`${ADMIN_SURFACE_POPOVER} p-4`}>
                <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>{label}</p>
                <p className={`${ADMIN_TEXT_STYLES.strong} mt-1 text-xl font-semibold`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className={`${ADMIN_SURFACE_POPOVER} p-4`}>
              <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Legacy Initial Contract Price total — evidence only</p>
              <p className={`${ADMIN_TEXT_STYLES.strong} mt-1 font-semibold`}>{money(dryRun.legacy_initial_contract_price_total)}</p>
            </div>
            <div className={`${ADMIN_SURFACE_POPOVER} p-4`}>
              <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Legacy Price After Change Orders total — evidence only</p>
              <p className={`${ADMIN_TEXT_STYLES.strong} mt-1 font-semibold`}>{money(dryRun.legacy_price_after_change_orders_total)}</p>
            </div>
          </div>
        </section>
      ) : null}

      {review && unresolvedRows.length > 0 ? (
        <section className={`${ADMIN_SURFACE_CARD} p-5`}>
          <h2 className={`${ADMIN_TEXT_STYLES.strong} text-lg font-semibold`}>Rows Requiring Mapping</h2>
          <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>Resolve customer and Sales Rep matches. Validation errors remain fail-closed.</p>
          <div className="mt-4 space-y-4">
            {unresolvedRows.map((row) => (
              <div key={row.id} className={`${ADMIN_SURFACE_POPOVER} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`${ADMIN_TEXT_STYLES.strong} font-medium`}>Row {row.row_number} · {row.project_name || "Missing Project Name"}</p>
                    <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>{row.customer || "Missing customer"} · {row.project_address || "No address"}</p>
                    <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-xs`}>Sales Rep: {row.sales_rep || "—"} · Customer matches: {row.customer_match_count} · Sales matches: {row.sales_rep_match_count}</p>
                  </div>
                  <StatusPill status={row.mapping_status} />
                </div>
                {row.validation_errors.length > 0 ? (
                  <div className="mt-3"><Alert variant="error" title="Validation" message={row.validation_errors.join(", ")} /></div>
                ) : null}
                <MappingEditor row={row} onSaved={saveMappingRefresh} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {review ? (
        <section className={`${ADMIN_SURFACE_CARD} p-5`}>
          <h2 className={`${ADMIN_TEXT_STYLES.strong} text-lg font-semibold`}>Row Summary</h2>
          <div className="mt-4">
            <TableViewport>
              <Table variant="admin" minWidth="standard">
                <TableHeader variant="admin">
                  <TableRow>
                    {['Row', 'Customer', 'Project', 'Status', 'Initial', 'After CO', 'Margin'].map((label) => (
                      <TableCell key={label} isHeader variant="admin">{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody variant="admin">
                  {review.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell variant="admin">{row.row_number}</TableCell>
                      <TableCell variant="admin">{row.customer || "—"}</TableCell>
                      <TableCell variant="admin">
                        <div className={`${ADMIN_TEXT_STYLES.strong} font-medium`}>{row.project_name || "—"}</div>
                        <div className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>{row.project_address || ""}</div>
                      </TableCell>
                      <TableCell variant="admin"><StatusPill status={row.mapping_status} /></TableCell>
                      <TableCell variant="admin">{money(row.legacy_initial_contract_price)}</TableCell>
                      <TableCell variant="admin">{money(row.legacy_price_after_change_orders)}</TableCell>
                      <TableCell variant="admin">{row.legacy_profit_margin === null ? "—" : `${row.legacy_profit_margin}${row.legacy_profit_margin_unit === "percent" ? "%" : ""}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableViewport>
          </div>
        </section>
      ) : null}

      {review && dryRun && !committed ? (
        <section className={`${ADMIN_SURFACE_CARD} p-5`}>
          <div className="flex items-center gap-2">
            <h2 className={`${ADMIN_TEXT_STYLES.strong} text-lg font-semibold`}>Commit Import</h2>
            <StatusPill status={dryRun.status} />
          </div>
          <p className={`${ADMIN_TEXT_STYLES.muted} mt-2 text-sm`}>Commit is allowed only when the current Dry Run is ready. Any mapping change invalidates the prior fingerprint.</p>
          <div className={`${ADMIN_SURFACE_POPOVER} mt-4 p-4`}>
            <p className={`${ADMIN_TEXT_STYLES.muted} text-xs font-medium uppercase tracking-wide`}>Exact Dry Run fingerprint</p>
            <code className={`${ADMIN_TEXT_STYLES.strong} mt-2 block break-all text-xs`}>{dryRun.fingerprint || "—"}</code>
          </div>
          <div className="mt-4">
            <Label>
              <span className="flex items-start gap-3">
                <InputNative
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={dryRun.status !== "ready"}
                  className={CHECKBOX_STYLE}
                />
                <span>I reviewed the row mappings and evidence totals and want to commit this exact Dry Run.</span>
              </span>
            </Label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void commitImport()} disabled={busy || dryRun.status !== "ready" || !dryRun.fingerprint || !confirmed}>
              Commit Import
            </Button>
          </div>
        </section>
      ) : null}

      {committed ? (
        <Alert
          variant="success"
          title="Import committed"
          message={review.batch.committed_at ? `Committed at ${formatDateTime(review.batch.committed_at)}` : "The batch is committed and cannot be committed again."}
        />
      ) : null}
    </div>
  );
}
