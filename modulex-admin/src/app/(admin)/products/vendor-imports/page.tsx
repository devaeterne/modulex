"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
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
type SyncAlert = { variant: "success" | "warning"; message: string };

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

const REVIEW_STATUSES: ReviewStatus[] = ["PENDING", "APPROVED", "IGNORED"];
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

export default function VendorImportsPage() {
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("PENDING");
  const [changeStates, setChangeStates] = useState<ChangeState[]>(["NEW", "UPDATED"]);
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncAlert, setSyncAlert] = useState<SyncAlert | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (changeStates.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("vendor_catalog_items")
      .select(
        "id,vendor_code,external_id,sku,title,product_url,vendor_price_reference,vendor_currency,change_state,review_status,canonical_product_id,last_seen_at"
      )
      .eq("review_status", reviewStatus)
      .in("change_state", changeStates)
      .order("last_seen_at", { ascending: false })
      .limit(100);

    if (queryError) {
      setError(queryError.message);
      setItems([]);
    } else {
      setItems((data ?? []) as VendorCatalogItem[]);
    }
    setLoading(false);
  }, [changeStates, reviewStatus]);

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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your admin session could not be verified. Please sign in again.");
      }

      const response = await fetch("/api/vendor-catalog/sync", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const payload = (await response.json().catch(() => ({}))) as SyncResponse;
      if (!response.ok) {
        throw new Error(payload.error || `Vendor sync failed with HTTP ${response.status}.`);
      }

      const results = payload.results ?? [];
      const totals = results.reduce(
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
        variant: totals.failed > 0 || payload.status === "PARTIAL_FAILURE" ? "warning" : "success",
        message: `Sync complete: ${totals.discovered} discovered, ${totals.created} new, ${totals.updated} updated, ${totals.unchanged} unchanged, ${totals.failed} failed.`,
      });
      await loadItems();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function setStatus(itemId: string, nextStatus: ReviewStatus) {
    setUpdatingId(itemId);
    setError(null);

    const { error: updateError } = await supabase
      .from("vendor_catalog_items")
      .update({ review_status: nextStatus })
      .eq("id", itemId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setItems((current) => current.filter((item) => item.id !== itemId));
    }
    setUpdatingId(null);
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Vendor Import Review" />

      <Alert
        variant="warning"
        title="Pricing and publication boundary"
        message="Vendor prices are reference data only. APPROVED does not publish or overwrite a Modulex product. Store publication still requires a Modulex selling price greater than zero."
      />

      {syncAlert ? (
        <Alert variant={syncAlert.variant} title="Vendor sync result" message={syncAlert.message} />
      ) : null}

      {error ? <Alert variant="error" title="Vendor catalog error" message={error} /> : null}

      <ComponentCard
        title="Vendor catalog review"
        desc="Review vendor discoveries before linking them to canonical Modulex products."
        headerAction={
          <Button onClick={() => void runVendorSync()} disabled={syncing}>
            {syncing ? "Running Vendor Sync…" : "Run Vendor Sync"}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2" aria-label="Review status filters">
            {REVIEW_STATUSES.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={reviewStatus === status ? "primary" : "outline"}
                onClick={() => setReviewStatus(status)}
              >
                {status}
              </Button>
            ))}
          </div>
          <p className="text-xs">{recordLabel}</p>
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
                <TableStateRow colSpan={8}>Loading vendor imports…</TableStateRow>
              ) : changeStates.length === 0 ? (
                <TableStateRow colSpan={8}>
                  Select at least one catalog state to show vendor imports.
                </TableStateRow>
              ) : items.length === 0 ? (
                <TableStateRow colSpan={8}>
                  No matching {reviewStatus.toLowerCase()} vendor imports.
                </TableStateRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="align-top">
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
                        className="font-medium underline"
                      >
                        {item.title}
                      </a>
                      <span className="mt-1 block truncate text-xs">{item.external_id}</span>
                    </TableCell>
                    <TableCell variant="admin">{formatPrice(item)}</TableCell>
                    <TableCell variant="admin" className="font-mono text-xs">
                      {item.canonical_product_id || "Not linked"}
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
                            APPROVED
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
