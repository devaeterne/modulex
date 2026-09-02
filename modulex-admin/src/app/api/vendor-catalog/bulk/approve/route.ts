import { withApiTiming } from "@/lib/observability/apiTiming";
import {
  approveReviewableVendorCatalogItem,
  VendorCatalogMissingError,
  VendorReviewNotEligibleError,
} from "@/lib/vendor-catalog/approval";
import { authorizeVendorCatalogAdmin } from "@/lib/vendor-catalog/auth";
import { CategoryMappingRequiredError } from "@/lib/vendor-catalog/mappings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BulkResult = {
  itemId: string;
  status: "APPROVED" | "SKIPPED" | "FAILED";
  code?: string;
  error?: string;
  productId?: string;
  storeProductContentId?: string | null;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );
  return results;
}

async function handlePost(request: Request) {
  const authorization = await authorizeVendorCatalogAdmin(request);
  if (authorization instanceof Response) return authorization;

  const body = (await request.json().catch(() => null)) as { itemIds?: unknown } | null;
  const itemIds = Array.isArray(body?.itemIds)
    ? [...new Set(body.itemIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    : [];

  if (itemIds.length === 0) {
    return Response.json({ error: "Select at least one vendor product." }, { status: 400 });
  }
  if (itemIds.length > 5) {
    return Response.json({ error: "Bulk approval accepts at most 5 products per request." }, { status: 400 });
  }

  const concurrency = 2;
  const results = await mapWithConcurrency<string, BulkResult>(
    itemIds,
    concurrency,
    async (itemId) => {
      try {
        const approved = await approveReviewableVendorCatalogItem(itemId, authorization);
        return {
          itemId,
          status: "APPROVED",
          productId: approved.productId,
          storeProductContentId: approved.storeProductContentId,
        };
      } catch (error) {
        if (error instanceof VendorCatalogMissingError) {
          return {
            itemId,
            status: "SKIPPED",
            code: error.code,
            error: error.message,
          };
        }
        if (error instanceof VendorReviewNotEligibleError) {
          return {
            itemId,
            status: "SKIPPED",
            code: error.code,
            error: error.message,
          };
        }
        if (error instanceof CategoryMappingRequiredError) {
          return {
            itemId,
            status: "SKIPPED",
            code: "CATEGORY_MAPPING_REQUIRED",
            error: error.message,
          };
        }

        return {
          itemId,
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  return Response.json({ results });
}

export async function POST(request: Request) {
  return withApiTiming({ route: "/api/vendor-catalog/bulk/approve", method: "POST" }, () => handlePost(request));
}
