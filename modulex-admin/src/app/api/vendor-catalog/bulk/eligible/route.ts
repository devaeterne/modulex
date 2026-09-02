import { withApiTiming } from "@/lib/observability/apiTiming";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { loadVendorCategoryMapping } from "@/lib/vendor-catalog/mappings";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const CHANGE_STATES = new Set(["NEW", "UPDATED", "UNCHANGED"]);
const AVAILABILITY_STATES = new Set([
  "AVAILABLE",
  "OUT_OF_STOCK",
  "UNAVAILABLE",
  "UNKNOWN",
  "MISSING",
]);

function safeSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

function parseChangeStates(value: string | null) {
  if (!value) return ["NEW", "UPDATED"];
  return value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => CHANGE_STATES.has(entry));
}

type Candidate = {
  id: string;
  vendor_code: string;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
};

async function handleGet(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "all";
  const category = url.searchParams.get("category") || "all";
  const reviewStatus = (url.searchParams.get("reviewStatus") || "PENDING").toUpperCase();
  const linked = url.searchParams.get("linked") || "all";
  const query = safeSearch(url.searchParams.get("query") || "");
  const availability = (url.searchParams.get("availability") || "all").toUpperCase();
  const changeStates = parseChangeStates(url.searchParams.get("changeStates"));

  if (
    reviewStatus !== "PENDING" ||
    (availability !== "ALL" && !AVAILABILITY_STATES.has(availability)) ||
    availability === "MISSING" ||
    changeStates.length === 0
  ) {
    return Response.json({ ids: [], total: 0 });
  }

  const candidates: Candidate[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let dbQuery = supabaseAdmin
      .from("vendor_catalog_items")
      .select("id,vendor_code,vendor_category_key,vendor_category_label")
      .eq("review_status", "PENDING")
      .neq("availability_status", "MISSING")
      .in("change_state", changeStates)
      .order("last_seen_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (availability !== "ALL") dbQuery = dbQuery.eq("availability_status", availability);
    if (vendor !== "all") dbQuery = dbQuery.eq("vendor_code", vendor);
    if (category !== "all") dbQuery = dbQuery.eq("vendor_category_key", category);
    if (linked === "linked") dbQuery = dbQuery.not("canonical_product_id", "is", null);
    if (linked === "unlinked") dbQuery = dbQuery.is("canonical_product_id", null);
    if (query) {
      dbQuery = dbQuery.or(
        `sku.ilike.%${query}%,title.ilike.%${query}%,external_id.ilike.%${query}%`
      );
    }

    const { data, error } = await dbQuery;
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    const batch = (data ?? []) as Candidate[];
    candidates.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const mappingEligibility = new Map<string, boolean>();
  const uniqueMappings = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.vendor_code}:${candidate.vendor_category_key ?? ""}`;
    if (!uniqueMappings.has(key)) uniqueMappings.set(key, candidate);
  }

  await Promise.all(
    [...uniqueMappings.entries()].map(async ([key, candidate]) => {
      try {
        await loadVendorCategoryMapping({
          vendorCode: candidate.vendor_code,
          vendorCategoryKey: candidate.vendor_category_key,
          vendorCategoryLabel: candidate.vendor_category_label,
        });
        mappingEligibility.set(key, true);
      } catch {
        mappingEligibility.set(key, false);
      }
    })
  );

  const ids = candidates
    .filter(
      (candidate) =>
        mappingEligibility.get(
          `${candidate.vendor_code}:${candidate.vendor_category_key ?? ""}`
        ) === true
    )
    .map((candidate) => candidate.id);

  return Response.json({ ids, total: ids.length });
}

export async function GET(request: Request) {
  return withApiTiming({ route: "/api/vendor-catalog/bulk/eligible", method: "GET" }, () => handleGet(request));
}
