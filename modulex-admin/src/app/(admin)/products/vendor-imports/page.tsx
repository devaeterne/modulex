"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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

type ReviewStatus = "PENDING" | "APPROVED" | "IGNORED";
type ChangeState = "NEW" | "UPDATED" | "UNCHANGED";

type SyncAlert = {
  variant: "success" | "warning";
  message: string;
};

type VendorOption = {
  code: string;
  label: string;
};

type VendorCatalogItem = {
  id: string;
  vendor_code: string;
  external_id: string;
  sku: string | null;
  title: string;
  product_url: string;
  vendor_price_reference: number | null;
  vendor_currency: string | null;
  change_state: ChangeState;
  review_status: ReviewStatus;
  canonical_product_id: string | null;
  last_seen_at: string;
  image_url: string | null;
};

type VendorImageRow = {
  item_id: string;
  url: string;
  sort_order: number;
  storage_bucket: string | null;
  storage_path: string | null;
};

type SyncResult = {
  vendorCode: string;
  status: "SUCCEEDED" | "FAILED";
  counts: {
    discovered: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
  };
};

type SyncResponse = {
  status?: "SUCCEEDED" | "PARTIAL_FAILURE";
  results?: SyncResult[];
  error?: string;
};

type ApproveResponse = {
  status?: "APPROVED";
  productId?: string;
  storeProductContentId?: string;
  archivedImageCount?: number;
  error?: string;
};

const VENDOR_CATALOG_SELECT =
  "id,vendor_code,external_id,sku,title,product_url,vendor_price_reference,vendor_currency,change_state,review_status,canonical_product_id,last_seen_at" as const;
const VENDOR_IMAGE_SELECT =
  "item_id,url,sort_order,storage_bucket,storage_path" as const;

const REVIEW_STATUSES: ReviewStatus[] = ["PENDING", "APPROVED", "IGNORED"];
const DEFAULT_CHANGE_STATES: ChangeState[] = ["NEW", "UPDATED"];
const CHANGE_FILTERS: Array<{ state: ChangeState; label: string }> = [
  { state: "NEW", label: "New" },
  { state: "UPDATED", label: "Updated" },
  { state: "UNCHANGED", label: "Synced / Unchanged" },
];

function formatPrice(item: VendorCatalogItem) {
  if (item.vendor_price_reference === null) return "—";
  const currency = item.vendor_currency || "USD";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(item.vendor_price_reference);
  } catch {
    return `${item.vendor_price_reference} ${currency}`;
  }
}

function badgeColor(state: ChangeState): "success" | "warning" | "light" {
  if (state === "NEW") return "success";
  if (state === "UPDATED") return "warning";
  return "light";
}

function getSyncErrorMessage(status: number, payload: SyncResponse) {
  if (status === 504) {
    return (
      "Vendor sync exceeded the server execution time limit. " +
      "Refresh the list before retrying; completed discovery batches may already be visible."
    );
  }
  if (status === 502 || status === 503) {
    return payload.error || "The vendor sync service is temporarily unavailable.";
  }
  if (status === 401) return "Your admin session could not be verified. Please sign in again.";
  if (status === 403) return "You do not have permission to run vendor synchronization.";
  return payload.error || `Vendor sync failed with HTTP ${status}.`;
}

export default function VendorImportsPage() {
  const router = useRouter();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("PENDING");
  const [changeStates, setChangeStates] = useState<ChangeState[]>(DEFAULT_CHANGE_STATES);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedVendor, setSelectedVendor] = useState("all");
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncAlert, setSyncAlert] = useState<SyncAlert | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const vendorSelectOptions = useMemo(
    () => [
      { value: "all", label: "All vendors" },
      ...vendors.map((vendor) => ({ value: vendor.code, label: vendor.label })),
    ],
    [vendors]
  );

  const selectedVendorLabel = useMemo(
    () =>
      selectedVendor === "all"
        ? "All Vendors"
        : vendors.find((vendor) => vendor.code === selectedVendor)?.label ?? selectedVendor,
    [selectedVendor, vendors]
  );

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Your admin session could not be verified. Please sign in again.");
    }

    return session.access_token;
  }, []);

  const loadVendors = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/vendor-catalog/vendors", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        vendors?: VendorOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to load vendor filters.");
      setVendors(payload.vendors ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [getAccessToken]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (changeStates.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("vendor_catalog_items")
      .select(VENDOR_CATALOG_SELECT)
      .eq("review_status", reviewStatus)
      .in("change_state", changeStates)
      .order("last_seen_at", { ascending: false })
      .limit(100);

    if (selectedVendor !== "all") {
      query = query.eq("vendor_code", selectedVendor);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    const itemIds = rows.map((row) => row.id);
    const primaryImageByItem = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: imageRows, error: imageError } = await supabase
        .from("vendor_catalog_assets")
        .select(VENDOR_IMAGE_SELECT)
        .eq("kind", "image")
        .in("item_id", itemIds)
        .order("sort_order", { ascending: true });

      if (imageError) {
        setError(imageError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      for (const row of (imageRows ?? []) as VendorImageRow[]) {
        if (primaryImageByItem.has(row.item_id)) continue;
        if (row.storage_bucket && row.storage_path) {
          const {
            data: { publicUrl },
          } = supabase.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
          primaryImageByItem.set(row.item_id, publicUrl);
        } else {
          primaryImageByItem.set(row.item_id, row.url);
        }
      }
    }

    const nextItems: VendorCatalogItem[] = rows.map((row) => ({
      id: row.id,
      vendor_code: row.vendor_code,
      external_id: row.external_id,
      sku: row.sku,
      title: row.title,
      product_url: row.product_url,
      vendor_price_reference:
        row.vendor_price_reference === null ? null : Number(row.vendor_price_reference),
      vendor_currency: row.vendor_currency,
      change_state: row.change_state as ChangeState,
      review_status: row.review_status as ReviewStatus,
      canonical_product_id: row.canonical_product_id,
      last_seen_at: row.last_seen_at,
      image_url: primaryImageByItem.get(row.id) ?? null,
    }));

    setItems(nextItems);
    setLoading(false);
  }, [changeStates, reviewStatus, selectedVendor]);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const recordLabel = useMemo(
    () =>
      reviewStatus === "PENDING"
        ? `${items.length} pending records · latest 100 matches`
        : `${items.length} records · latest 100 matches`,
    [items.length, reviewStatus]
  );

  function toggleChangeState(state: ChangeState) {
    setChangeStates((current) =>
      current.includes(state)
        ? current.filter((item) => item !== state)
        : [...current, state]
    );
  }

  async function runVendorSync() {
    setSyncing(true);
    setError(null);
    setSyncAlert(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/vendor-catalog/sync", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          selectedVendor === "all" ? {} : { vendors: [selectedVendor] }
        ),
      });

      const payload = (await response.json().catch(() => ({}))) as SyncResponse;
      if (!response.ok) {
        throw new Error(getSyncErrorMessage(response.status, payload));
      }

      const totals = (payload.results ?? []).reduce(
        (sum, result) => ({
          discovered: sum.discovered + result.counts.discovered,
          created: sum.created + result.counts.created,
          updated: sum.updated + result.counts.updated,
          unchanged: sum.unchanged + result.counts.unchanged,
          failed: sum.failed + result.counts.failed,
        }),
        { discovered: 0, created: 0, updated: 0, unchanged: 0, failed: 0 }
      );

      setSyncAlert({
        variant:
          totals.failed > 0 || payload.status === "PARTIAL_FAILURE" ? "warning" : "success",
        message:
          `${selectedVendorLabel} sync complete: ` +
          `${totals.discovered} discovered, ${totals.created} new, ` +
          `${totals.updated} updated, ${totals.unchanged} unchanged, ${totals.failed} failed.`,
      });

      await loadItems();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
      await loadItems().catch(() => undefined);
    } finally {
      setSyncing(false);
    }
  }

  async function approveItem(itemId: string) {
    const accessToken = await getAccessToken();
    const response = await fetch(`/api/vendor-catalog/items/${itemId}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json().catch(() => ({}))) as ApproveResponse;
    if (!response.ok || !payload.storeProductContentId) {
      throw new Error(payload.error || "Vendor product approval failed.");
    }

    setSyncAlert({
      variant: "success",
      message: `Product approved. ${payload.archivedImageCount ?? 0} images were optimized to WebP and saved to Modulex Storage.`,
    });
    router.push(`/store/products/${payload.storeProductContentId}/edit`);
  }

  async function setStatus(itemId: string, nextStatus: ReviewStatus) {
    setUpdatingId(itemId);
    setError(null);
    setSyncAlert(null);

    try {
      if (nextStatus === "APPROVED") {
        await approveItem(itemId);
        return;
      }

      const { error: updateError } = await supabase
        .from("vendor_catalog_items")
        .update({ review_status: nextStatus })
        .eq("id", itemId);
      if (updateError) throw updateError;

      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Vendor Import Review" />

      <Alert
        variant="warning"
        title="Pricing and publication boundary"
        message="Vendor prices are reference data only. Approval creates or links the canonical Sink product and archives its images in Modulex Storage, but Store publication still requires a valid Modulex selling price greater than zero."
      />

      <div aria-live="polite">
        {syncAlert ? (
          <Alert
            variant={syncAlert.variant}
            title="Vendor catalog result"
            message={syncAlert.message}
          />
        ) : null}
      </div>

      <div aria-live="assertive">
        {error ? (
          <Alert variant="error" title="Vendor catalog error" message={error} />
        ) : null}
      </div>

      <ComponentCard
        title="Vendor catalog review"
        desc="Discovery keeps external image URLs lightweight. Images are downloaded, resized and converted to WebP only after approval."
        headerAction={
          <Button onClick={() => void runVendorSync()} disabled={syncing}>
            {syncing ? `Running ${selectedVendorLabel} Sync…` : `Run ${selectedVendorLabel} Sync`}
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr] lg:items-end">
          <div>
            <Label htmlFor="vendor-catalog-vendor">Vendor</Label>
            <Select
              id="vendor-catalog-vendor"
              value={selectedVendor}
              options={vendorSelectOptions}
              onChange={setSelectedVendor}
              ariaLabel="Filter and sync vendor"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2" aria-label="Review status filters">
              {REVIEW_STATUSES.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={reviewStatus === status ? "primary" : "outline"}
                  aria-pressed={reviewStatus === status}
                  onClick={() => setReviewStatus(status)}
                >
                  {status}
                </Button>
              ))}
            </div>

            <Badge size="sm" color="light">
              {recordLabel}
            </Badge>
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-x-5 gap-y-3">
          <legend className="sr-only">Catalog change filters</legend>
          {CHANGE_FILTERS.map(({ state, label }) => (
            <Checkbox
              key={state}
              id={`vendor-state-${state.toLowerCase()}`}
              label={label}
              checked={changeStates.includes(state)}
              onChange={() => toggleChangeState(state)}
            />
          ))}
        </fieldset>

        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Image</TableCell>
                <TableCell isHeader variant="admin">Vendor</TableCell>
                <TableCell isHeader variant="admin">State</TableCell>
                <TableCell isHeader variant="admin">SKU</TableCell>
                <TableCell isHeader variant="admin">Product</TableCell>
                <TableCell isHeader variant="admin">Vendor price</TableCell>
                <TableCell isHeader variant="admin">Canonical link</TableCell>
                <TableCell isHeader variant="admin">Last seen</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Review</TableCell>
              </TableRow>
            </TableHeader>

            <TableBody variant="admin">
              {loading ? (
                <TableStateRow colSpan={9}>Loading vendor imports…</TableStateRow>
              ) : changeStates.length === 0 ? (
                <TableStateRow colSpan={9}>
                  Select at least one catalog state to show vendor imports.
                </TableStateRow>
              ) : items.length === 0 ? (
                <TableStateRow colSpan={9}>
                  No matching {reviewStatus.toLowerCase()} vendor imports.
                </TableStateRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="align-middle">
                    <TableCell variant="admin">
                      {item.image_url ? (
                        <a href={item.image_url} target="_blank" rel="noreferrer">
                          <img
                            src={item.image_url}
                            alt={item.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-14 w-14 object-contain"
                          />
                        </a>
                      ) : (
                        <Badge size="sm" color="light">No image</Badge>
                      )}
                    </TableCell>

                    <TableCell variant="admin" className="font-medium uppercase">
                      {item.vendor_code}
                    </TableCell>

                    <TableCell variant="admin">
                      <Badge size="sm" color={badgeColor(item.change_state)}>
                        {item.change_state}
                      </Badge>
                    </TableCell>

                    <TableCell variant="admin" className="font-mono text-xs">
                      {item.sku || "—"}
                    </TableCell>

                    <TableCell variant="admin" className="max-w-sm">
                      <a
                        href={item.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline underline-offset-4 transition-opacity hover:opacity-75"
                      >
                        {item.title}
                      </a>
                      <span className="mt-1 block truncate text-xs opacity-70">
                        {item.external_id}
                      </span>
                    </TableCell>

                    <TableCell variant="admin">{formatPrice(item)}</TableCell>

                    <TableCell variant="admin" className="font-mono text-xs">
                      {item.canonical_product_id ? (
                        <a
                          href={`/products/${item.canonical_product_id}/edit`}
                          className="underline underline-offset-4 transition-opacity hover:opacity-75"
                        >
                          Open product
                        </a>
                      ) : (
                        "Not linked"
                      )}
                    </TableCell>

                    <TableCell variant="admin" className="whitespace-nowrap text-xs">
                      {new Date(item.last_seen_at).toLocaleString()}
                    </TableCell>

                    <TableCell variant="admin">
                      <div className="flex justify-end gap-2">
                        {reviewStatus !== "APPROVED" ? (
                          <Button
                            size="sm"
                            disabled={updatingId === item.id}
                            onClick={() => void setStatus(item.id, "APPROVED")}
                          >
                            {updatingId === item.id ? "APPROVING…" : "APPROVED"}
                          </Button>
                        ) : null}

                        {reviewStatus !== "IGNORED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === item.id}
                            onClick={() => void setStatus(item.id, "IGNORED")}
                          >
                            IGNORED
                          </Button>
                        ) : null}

                        {reviewStatus !== "PENDING" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === item.id}
                            onClick={() => void setStatus(item.id, "PENDING")}
                          >
                            PENDING
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>
    </div>
  );
}