import { jsonError, requirePermission } from "@/lib/auth/admin-api";
import {
  commitHistoricalProjectImport,
  dryRunHistoricalProjectImport,
  lookupHistoricalProjectImportCandidates,
  mapHistoricalProjectImportRow,
  reviewHistoricalProjectImport,
  stageHistoricalProjectWorkbook,
} from "@/lib/projects/historical-import-server";
import { withApiTiming } from "@/lib/observability/apiTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/projects/import";
const MAX_WORKBOOK_BYTES = 15 * 1024 * 1024;

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function requiredText(value: unknown, code: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(code);
  return text;
}

function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function statusForError(message: string) {
  if (/ADMIN_REQUIRED|permission|forbidden/i.test(message)) return 403;
  if (/NOT_FOUND/.test(message)) return 404;
  if (/ALREADY_COMMITTED|STALE|DUPLICATE/.test(message)) return 409;
  if (/RUNTIME_CONFIG/.test(message)) return 503;
  if (/RPC:/.test(message)) return 422;
  return 400;
}

async function handleMultipart(request: Request, token: string) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("PROJECT_IMPORT_FILE_REQUIRED");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("PROJECT_IMPORT_XLSX_REQUIRED");
  if (file.size <= 0) throw new Error("PROJECT_IMPORT_EMPTY_WORKBOOK");
  if (file.size > MAX_WORKBOOK_BYTES) throw new Error("PROJECT_IMPORT_WORKBOOK_TOO_LARGE");

  const defaultStatus = requiredText(form.get("default_status"), "PROJECT_IMPORT_STATUS_REQUIRED");
  const sheetValue = String(form.get("sheet") ?? "").trim();
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await stageHistoricalProjectWorkbook({
    accessToken: token,
    sourceName: file.name,
    bytes,
    sheet: sheetValue || null,
    defaultStatus,
  });
  return response(result, 201);
}

async function handleJson(request: Request, token: string) {
  const body = await request.json() as Record<string, unknown>;
  const action = requiredText(body.action, "PROJECT_IMPORT_ACTION_REQUIRED");

  if (action === "review") {
    const batchId = requiredText(body.batch_id, "PROJECT_IMPORT_BATCH_ID_REQUIRED");
    return response(await reviewHistoricalProjectImport(token, batchId));
  }

  if (action === "mapping") {
    const rowId = requiredText(body.row_id, "PROJECT_IMPORT_ROW_ID_REQUIRED");
    const customerId = requiredText(body.customer_id, "PROJECT_IMPORT_CUSTOMER_REQUIRED");
    const targetStatus = requiredText(body.target_status, "PROJECT_IMPORT_STATUS_REQUIRED");
    const note = requiredText(body.note, "PROJECT_IMPORT_MAPPING_NOTE_REQUIRED");
    const salesRepId = String(body.sales_rep_id ?? "").trim() || null;
    return response(await mapHistoricalProjectImportRow({
      accessToken: token,
      rowId,
      customerId,
      salesRepId,
      targetStatus,
      note,
    }));
  }

  if (action === "dry-run") {
    const batchId = requiredText(body.batch_id, "PROJECT_IMPORT_BATCH_ID_REQUIRED");
    return response(await dryRunHistoricalProjectImport(token, batchId));
  }

  if (action === "commit") {
    const batchId = requiredText(body.batch_id, "PROJECT_IMPORT_BATCH_ID_REQUIRED");
    const fingerprint = requiredText(body.fingerprint, "PROJECT_IMPORT_FINGERPRINT_REQUIRED").toLowerCase();
    return response(await commitHistoricalProjectImport(token, batchId, fingerprint));
  }

  if (action === "lookup") {
    const kind = requiredText(body.kind, "PROJECT_IMPORT_LOOKUP_KIND_REQUIRED");
    if (kind !== "customer" && kind !== "sales_rep") {
      throw new Error("PROJECT_IMPORT_LOOKUP_KIND_INVALID");
    }
    const query = requiredText(body.query, "PROJECT_IMPORT_LOOKUP_QUERY_REQUIRED");
    return response({
      ok: true,
      options: await lookupHistoricalProjectImportCandidates({
        accessToken: token,
        kind,
        query,
      }),
    });
  }

  throw new Error("PROJECT_IMPORT_ACTION_INVALID");
}

async function handlePost(request: Request) {
  const auth = await requirePermission(request, "projects.import");
  if (auth.response) return auth.response;

  const token = accessToken(request);
  if (!token) return jsonError("Authentication required.", 401);

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await handleMultipart(request, token);
    }
    if (contentType.includes("application/json")) {
      return await handleJson(request, token);
    }
    return jsonError("Unsupported request content type.", 415);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("Historical Project import request failed", error);
    return jsonError(message || "Historical Project import request failed.", statusForError(message));
  }
}

export async function POST(request: Request) {
  return withApiTiming({ route: ROUTE, method: "POST" }, () => handlePost(request));
}
