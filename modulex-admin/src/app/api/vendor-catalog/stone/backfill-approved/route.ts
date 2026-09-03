import { NextResponse } from "next/server";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { approveStoneVendorCatalogItem } from "@/lib/vendor-catalog/stone-approve";
import { serializeUnknownError, unknownErrorMessage } from "@/lib/errors/unknown-error";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

type BackfillResult = {
  itemId: string;
  status: "BACKFILLED" | "FAILED";
  archivedImageCount?: number;
  error?: string;
};

function boundedLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(10, Math.trunc(parsed)));
}

async function handlePost(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = boundedLimit(body.limit);

  const { data: approvedRows, error: approvedError } = await supabaseAdmin
    .from("vendor_catalog_items")
    .select("id,canonical_product_id")
    .eq("catalog_domain", "stone")
    .eq("review_status", "APPROVED")
    .not("canonical_product_id", "is", null)
    .order("reviewed_at", { ascending: true })
    .limit(500);
  if (approvedError) {
    console.error("[stone-backfill] Unable to load approved Stone rows.", serializeUnknownError(approvedError));
    return NextResponse.json({ error: unknownErrorMessage(approvedError, "Unable to load approved Stone rows.") }, { status: 500 });
  }

  const productIds = [...new Set((approvedRows ?? []).map((row) => row.canonical_product_id).filter((id): id is string => Boolean(id)))];
  const { data: products, error: productsError } = productIds.length
    ? await supabaseAdmin
        .from("products")
        .select("id,sku,base_product_code")
        .in("id", productIds)
    : { data: [], error: null };
  if (productsError) {
    console.error("[stone-backfill] Unable to load canonical products.", serializeUnknownError(productsError));
    return NextResponse.json({ error: unknownErrorMessage(productsError, "Unable to load canonical Stone products.") }, { status: 500 });
  }

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const baseCodes = [...new Set((products ?? []).map((product) => product.base_product_code || product.sku).filter(Boolean))];
  const { data: contentRows, error: contentError } = baseCodes.length
    ? await supabaseAdmin
        .from("store_product_content")
        .select("base_product_code")
        .in("base_product_code", baseCodes)
    : { data: [], error: null };
  if (contentError) {
    console.error("[stone-backfill] Unable to load Store content.", serializeUnknownError(contentError));
    return NextResponse.json({ error: unknownErrorMessage(contentError, "Unable to load Stone Store content.") }, { status: 500 });
  }

  const contentCodes = new Set((contentRows ?? []).map((row) => row.base_product_code));
  const candidates = (approvedRows ?? []).filter((row) => {
    if (!row.canonical_product_id) return false;
    const product = productById.get(row.canonical_product_id);
    if (!product) return false;
    return !contentCodes.has(product.base_product_code || product.sku);
  });
  const batch = candidates.slice(0, limit);
  const results: BackfillResult[] = [];

  for (const row of batch) {
    try {
      const result = await approveStoneVendorCatalogItem(row.id, authorization);
      results.push({
        itemId: row.id,
        status: "BACKFILLED",
        archivedImageCount: result.archivedImageCount,
      });
    } catch (error) {
      console.error("[stone-backfill] Stone content backfill failed.", {
        itemId: row.id,
        error: serializeUnknownError(error),
      });
      results.push({
        itemId: row.id,
        status: "FAILED",
        error: unknownErrorMessage(error, "Stone content backfill failed."),
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((result) => result.status === "BACKFILLED").length,
    failed: results.filter((result) => result.status === "FAILED").length,
    remaining: Math.max(0, candidates.length - batch.length),
    results,
  });
}

export async function POST(request: Request) {
  return withApiTiming(
    { route: "/api/vendor-catalog/stone/backfill-approved", method: "POST" },
    () => handlePost(request)
  );
}
