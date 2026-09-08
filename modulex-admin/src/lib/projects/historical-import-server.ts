import { createClient } from "@supabase/supabase-js";
import {
  HISTORICAL_PROJECT_STATUSES,
  extractHistoricalProjectWorkbook,
  workbookSha256,
  type HistoricalProjectStatus,
} from "@/lib/projects/historical-import-workbook";

type JsonRecord = Record<string, unknown>;

function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("PROJECT_IMPORT_RUNTIME_CONFIG_MISSING");
  }
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function ensureStatus(value: unknown): HistoricalProjectStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (!HISTORICAL_PROJECT_STATUSES.includes(status as HistoricalProjectStatus)) {
    throw new Error("PROJECT_IMPORT_STATUS_INVALID");
  }
  return status as HistoricalProjectStatus;
}

async function rpc(
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<JsonRecord> {
  const supabase = createUserScopedClient(accessToken);
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`PROJECT_IMPORT_RPC:${name}:${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`PROJECT_IMPORT_RPC_INVALID:${name}`);
  }
  return data as JsonRecord;
}

export function inspectHistoricalProjectWorkbook(input: {
  bytes: Buffer;
  sheet?: string | null;
  defaultStatus: string;
}) {
  const defaultStatus = ensureStatus(input.defaultStatus);
  const extraction = extractHistoricalProjectWorkbook(input.bytes, {
    sheet: input.sheet,
    defaultStatus,
  });
  return {
    sheet: extraction.sheet,
    sheets: extraction.sheets,
    headers: extraction.headers,
    row_count: extraction.rows.length,
  };
}

export async function stageHistoricalProjectWorkbook(input: {
  accessToken: string;
  sourceName: string;
  bytes: Buffer;
  sheet?: string | null;
  defaultStatus: string;
}) {
  const defaultStatus = ensureStatus(input.defaultStatus);
  const extraction = extractHistoricalProjectWorkbook(input.bytes, {
    sheet: input.sheet,
    defaultStatus,
  });
  const staged = await rpc(input.accessToken, "stage_customer_project_import", {
    p_source_name: input.sourceName,
    p_source_sha256: workbookSha256(input.bytes),
    p_rows: extraction.rows,
  });
  const batchId = String(staged.batch_id ?? "");
  if (!batchId) throw new Error("PROJECT_IMPORT_BATCH_ID_MISSING");

  const dryRun = await rpc(input.accessToken, "dry_run_customer_project_import", {
    p_batch_id: batchId,
  });
  const review = await rpc(input.accessToken, "get_customer_project_import_batch", {
    p_batch_id: batchId,
  });

  return {
    extraction: {
      sheet: extraction.sheet,
      sheets: extraction.sheets,
      headers: extraction.headers,
      row_count: extraction.rows.length,
    },
    staged,
    dry_run: dryRun,
    review,
  };
}

export function reviewHistoricalProjectImport(accessToken: string, batchId: string) {
  return rpc(accessToken, "get_customer_project_import_batch", { p_batch_id: batchId });
}

export async function mapHistoricalProjectImportRow(input: {
  accessToken: string;
  rowId: string;
  customerId: string;
  salesRepId?: string | null;
  targetStatus: string;
  note: string;
}) {
  const targetStatus = ensureStatus(input.targetStatus);
  return rpc(input.accessToken, "set_customer_project_import_row_mapping", {
    p_row_id: input.rowId,
    p_customer_id: input.customerId,
    p_sales_rep_id: input.salesRepId || null,
    p_target_status: targetStatus,
    p_note: input.note,
  });
}

export function dryRunHistoricalProjectImport(accessToken: string, batchId: string) {
  return rpc(accessToken, "dry_run_customer_project_import", { p_batch_id: batchId });
}

export function commitHistoricalProjectImport(
  accessToken: string,
  batchId: string,
  expectedFingerprint: string,
) {
  if (!/^[0-9a-f]{64}$/.test(expectedFingerprint)) {
    throw new Error("PROJECT_IMPORT_FINGERPRINT_INVALID");
  }
  return rpc(accessToken, "commit_customer_project_import", {
    p_batch_id: batchId,
    p_expected_fingerprint: expectedFingerprint,
  });
}

function searchPattern(query: string) {
  const normalized = query.trim().replace(/[%,]/g, "");
  if (normalized.length < 2) throw new Error("PROJECT_IMPORT_LOOKUP_QUERY_SHORT");
  return `%${normalized}%`;
}

export async function lookupHistoricalProjectImportCandidates(input: {
  accessToken: string;
  kind: "customer" | "sales_rep";
  query: string;
}) {
  const supabase = createUserScopedClient(input.accessToken);
  const pattern = searchPattern(input.query);

  if (input.kind === "customer") {
    const [{ data: byName, error: nameError }, { data: byLegal, error: legalError }] = await Promise.all([
      supabase.from("customers").select("id,name,legal_name").ilike("name", pattern).limit(12),
      supabase.from("customers").select("id,name,legal_name").ilike("legal_name", pattern).limit(12),
    ]);
    if (nameError && legalError) throw new Error(`PROJECT_IMPORT_CUSTOMER_LOOKUP:${nameError.message}`);
    const combined = [...(byName ?? []), ...(byLegal ?? [])];
    const unique = new Map<string, { id: string; label: string }>();
    for (const row of combined) {
      const name = String(row.name ?? row.legal_name ?? "Unnamed customer");
      unique.set(String(row.id), { id: String(row.id), label: name });
    }
    return Array.from(unique.values()).slice(0, 15);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name")
    .eq("is_active", true)
    .ilike("full_name", pattern)
    .limit(15);
  if (error) throw new Error(`PROJECT_IMPORT_SALES_REP_LOOKUP:${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.full_name ?? "Unnamed user"),
  }));
}
