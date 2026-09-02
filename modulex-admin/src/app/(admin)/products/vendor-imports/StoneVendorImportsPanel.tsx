"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import InputField from "@/components/form/input/InputField";
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
type LinkedFilter = "all" | "linked" | "unlinked";
type VendorAvailabilityStatus = "AVAILABLE" | "OUT_OF_STOCK" | "UNAVAILABLE" | "UNKNOWN" | "MISSING";
type AvailabilityFilter = "all" | VendorAvailabilityStatus;

type StoneVendorCategory = { key: string; label: string; productCount: number | null };
type StoneVendorOption = {
  code: string;
  label: string;
  categories: StoneVendorCategory[];
  categoriesLoaded: boolean;
};
type StoneVariant = {
  vendorSku?: string | null;
  form?: string | null;
  thickness?: string | null;
  finish?: string | null;
  dimensions?: string | null;
  slabSizeClass?: string | null;
  bookMatch?: boolean | null;
};
type StoneInventory = {
  lotNumber?: string | null;
  batchNumber?: string | null;
  location?: string | null;
  dimensions?: string | null;
  quantity?: number | null;
  availability?: VendorAvailabilityStatus | null;
};
type StoneData = {
  sourceStoneTypeName?: string | null;
  stoneTypeName?: string | null;
  brand?: string | null;
  collection?: string | null;
  colors?: string[] | null;
  backgroundColor?: string | null;
  veinColors?: string[] | null;
  colorTone?: string | null;
  features?: string[] | null;
  variant?: StoneVariant | null;
  vendorInventory?: StoneInventory[] | null;
};
type StoneCatalogRow = {
  id: string;
  vendor_code: string;
  external_id: string;
  sku: string | null;
  title: string;
  product_url: string;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
  family_key: string | null;
  variant_code: string | null;
  variant_label: string | null;
  availability_status: VendorAvailabilityStatus;
  vendor_stock_quantity: number | null;
  change_state: ChangeState;
  review_status: ReviewStatus;
  canonical_product_id: string | null;
  last_seen_at: string;
  stone_type_id: string | null;
  stone_data: StoneData | null;
};
type StoneCatalogItem = Omit<StoneCatalogRow, "stone_data"> & {
  stone_data: StoneData;
  stone_type_name: string | null;
  stone_type_review_status: "approved" | "pending_review" | null;
  image_url: string | null;
};
type StoneTypeRow = { id: string; name: string; review_status: "approved" | "pending_review" };
type VendorImageRow = {
  item_id: string;
  url: string;
  sort_order: number;
  storage_bucket: string | null;
  storage_path: string | null;
};
type StoneSyncResult = {
  vendorCode: string;
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};
type StoneSyncResponse = { results?: StoneSyncResult[]; error?: string };
type BulkResult = { itemId: string; status: "APPROVED" | "SKIPPED" | "FAILED"; error?: string };
type UiAlert = { variant: "success" | "warning" | "info"; title: string; message: string };

const STONE_CATALOG_SELECT =
  "id,vendor_code,external_id,sku,title,product_url,vendor_category_key,vendor_category_label,family_key,variant_code,variant_label,availability_status,vendor_stock_quantity,change_state,review_status,canonical_product_id,last_seen_at,stone_type_id,stone_data" as const;
const VENDOR_IMAGE_SELECT = "item_id,url,sort_order,storage_bucket,storage_path" as const;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const REVIEW_STATUSES: ReviewStatus[] = ["PENDING", "APPROVED", "IGNORED"];
const DEFAULT_CHANGE_STATES: ChangeState[] = ["NEW", "UPDATED"];
const CHANGE_FILTERS: Array<{ state: ChangeState; label: string }> = [
  { state: "NEW", label: "New" },
  { state: "UPDATED", label: "Updated" },
  { state: "UNCHANGED", label: "Synced / Unchanged" },
];
const AVAILABILITY_OPTIONS = [
  { value: "all", label: "All vendor states" },
  { value: "AVAILABLE", label: "Available" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "UNKNOWN", label: "Unknown" },
];

function safeSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function pageNumbers(current: number, total: number) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(current - 2, total - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function availabilityLabel(status: VendorAvailabilityStatus) {
  if (status === "OUT_OF_STOCK") return "Out of stock";
  if (status === "UNAVAILABLE") return "Unavailable";
  if (status === "MISSING") return "Missing";
  if (status === "UNKNOWN") return "Unknown";
  return "Available";
}

function availabilityColor(status: VendorAvailabilityStatus): "success" | "error" | "warning" | "light" {
  if (status === "AVAILABLE") return "success";
  if (status === "OUT_OF_STOCK" || status === "UNAVAILABLE") return "error";
  if (status === "MISSING") return "warning";
  return "light";
}

function changeColor(state: ChangeState): "success" | "warning" | "light" {
  if (state === "NEW") return "success";
  if (state === "UPDATED") return "warning";
  return "light";
}

export default function StoneVendorImportsPanel() {
  const requestIdRef = useRef(0);
  const [vendors, setVendors] = useState<StoneVendorOption[]>([]);
  const [syncVendor, setSyncVendor] = useState("");
  const [syncCategory, setSyncCategory] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("PENDING");
  const [changeStates, setChangeStates] = useState<ChangeState[]>(DEFAULT_CHANGE_STATES);
  const [tableVendor, setTableVendor] = useState("all");
  const [tableCategory, setTableCategory] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [linkedFilter, setLinkedFilter] = useState<LinkedFilter>("all");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<StoneCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<UiAlert | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAccessToken = useCallback(async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Your admin session could not be verified. Please sign in again.");
    return session.access_token;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkProgress(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const accessToken = await getAccessToken();
        const response = await fetch("/api/vendor-catalog/stone/vendors", {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          vendors?: Array<{ vendorCode: string; label: string; categories?: StoneVendorCategory[] }>;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Unable to load Stone vendor options.");
        setVendors((payload.vendors ?? []).map((vendor) => ({
          code: vendor.vendorCode,
          label: vendor.label,
          categories: vendor.categories ?? [],
          categoriesLoaded: Array.isArray(vendor.categories),
        })));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    })();
  }, [getAccessToken]);

  const ensureCategories = useCallback(async (vendorCode: string) => {
    if (!vendorCode || vendorCode === "all") return;
    const existing = vendors.find((vendor) => vendor.code === vendorCode);
    if (existing?.categoriesLoaded) return;

    const accessToken = await getAccessToken();
    const response = await fetch(
      `/api/vendor-catalog/stone/vendors?vendor=${encodeURIComponent(vendorCode)}`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      vendor?: { vendorCode: string; label: string; categories?: StoneVendorCategory[] };
      error?: string;
    };
    if (!response.ok || !payload.vendor) {
      throw new Error(payload.error || "Unable to load Stone vendor categories.");
    }
    setVendors((current) => current.map((vendor) =>
      vendor.code === vendorCode
        ? { ...vendor, categories: payload.vendor?.categories ?? [], categoriesLoaded: true }
        : vendor
    ));
  }, [getAccessToken, vendors]);

  useEffect(() => {
    if (!syncVendor) return;
    void ensureCategories(syncVendor).catch((categoryError) =>
      setError(categoryError instanceof Error ? categoryError.message : String(categoryError))
    );
  }, [ensureCategories, syncVendor]);

  useEffect(() => {
    if (tableVendor === "all") return;
    void ensureCategories(tableVendor).catch((categoryError) =>
      setError(categoryError instanceof Error ? categoryError.message : String(categoryError))
    );
  }, [ensureCategories, tableVendor]);

  const loadItems = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    if (changeStates.length === 0) {
      setItems([]);
      setTotalCount(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    const from = (currentPage - 1) * pageSize;
    let dbQuery = supabase
      .from("vendor_catalog_items")
      .select(STONE_CATALOG_SELECT, { count: "exact" })
      .eq("catalog_domain", "stone")
      .eq("review_status", reviewStatus)
      .in("change_state", changeStates);
    if (tableVendor !== "all") dbQuery = dbQuery.eq("vendor_code", tableVendor);
    if (tableCategory !== "all") dbQuery = dbQuery.eq("vendor_category_key", tableCategory);
    if (availabilityFilter !== "all") dbQuery = dbQuery.eq("availability_status", availabilityFilter);
    if (linkedFilter === "linked") dbQuery = dbQuery.not("canonical_product_id", "is", null);
    if (linkedFilter === "unlinked") dbQuery = dbQuery.is("canonical_product_id", null);
    if (query) {
      const safe = safeSearch(query);
      dbQuery = dbQuery.or(`sku.ilike.%${safe}%,title.ilike.%${safe}%,external_id.ilike.%${safe}%`);
    }

    const { data, count, error: queryError } = await dbQuery
      .order("last_seen_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (requestId !== requestIdRef.current) return;
    if (queryError) {
      setError(queryError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as StoneCatalogRow[];
    const itemIds = rows.map((row) => row.id);
    const stoneTypeIds = uniqueStrings(rows.map((row) => row.stone_type_id));
    const imageByItem = new Map<string, string>();
    const stoneTypeById = new Map<string, StoneTypeRow>();

    if (itemIds.length) {
      const { data: assets, error: assetError } = await supabase
        .from("vendor_catalog_assets")
        .select(VENDOR_IMAGE_SELECT)
        .eq("kind", "image")
        .in("item_id", itemIds)
        .order("sort_order", { ascending: true });
      if (assetError) {
        setError(assetError.message);
        setLoading(false);
        return;
      }
      for (const asset of (assets ?? []) as VendorImageRow[]) {
        if (imageByItem.has(asset.item_id)) continue;
        if (asset.storage_bucket && asset.storage_path) {
          const { data: { publicUrl } } = supabase.storage.from(asset.storage_bucket).getPublicUrl(asset.storage_path);
          imageByItem.set(asset.item_id, publicUrl);
        } else {
          imageByItem.set(asset.item_id, asset.url);
        }
      }
    }

    if (stoneTypeIds.length) {
      const { data: stoneTypes, error: stoneTypeError } = await supabase
        .from("countertop_stone_types")
        .select("id,name,review_status")
        .in("id", stoneTypeIds);
      if (stoneTypeError) {
        setError(stoneTypeError.message);
        setLoading(false);
        return;
      }
      for (const stoneType of (stoneTypes ?? []) as StoneTypeRow[]) stoneTypeById.set(stoneType.id, stoneType);
    }

    setItems(rows.map((row) => {
      const stoneType = row.stone_type_id ? stoneTypeById.get(row.stone_type_id) : null;
      return {
        ...row,
        vendor_stock_quantity: row.vendor_stock_quantity === null ? null : Number(row.vendor_stock_quantity),
        stone_data: row.stone_data ?? {},
        stone_type_name: stoneType?.name ?? null,
        stone_type_review_status: stoneType?.review_status ?? null,
        image_url: imageByItem.get(row.id) ?? null,
      };
    }));
    const nextCount = count ?? 0;
    const nextPages = Math.max(1, Math.ceil(nextCount / pageSize));
    setTotalCount(nextCount);
    setTotalPages(nextPages);
    if (currentPage > nextPages) setCurrentPage(nextPages);
    setLoading(false);
  }, [availabilityFilter, changeStates, currentPage, linkedFilter, pageSize, query, reviewStatus, tableCategory, tableVendor]);

  const loadEligibility = useCallback(async () => {
    if (reviewStatus !== "PENDING" || changeStates.length === 0) {
      setEligibleIds([]);
      return;
    }
    setEligibilityLoading(true);
    try {
      const accessToken = await getAccessToken();
      const params = new URLSearchParams({
        catalogDomain: "stone",
        vendor: tableVendor,
        category: tableCategory,
        reviewStatus,
        linked: linkedFilter,
        availability: availabilityFilter,
        changeStates: changeStates.join(","),
      });
      if (query) params.set("query", query);
      const response = await fetch(`/api/vendor-catalog/bulk/eligible?${params.toString()}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { ids?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to resolve Stone approval eligibility.");
      const ids = payload.ids ?? [];
      setEligibleIds(ids);
      const eligibleSet = new Set(ids);
      setSelectedIds((current) => new Set([...current].filter((id) => eligibleSet.has(id))));
    } catch (eligibilityError) {
      setEligibleIds([]);
      setError(eligibilityError instanceof Error ? eligibilityError.message : String(eligibilityError));
    } finally {
      setEligibilityLoading(false);
    }
  }, [availabilityFilter, changeStates, getAccessToken, linkedFilter, query, reviewStatus, tableCategory, tableVendor]);

  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => { void loadEligibility(); }, [loadEligibility]);

  const syncVendorOption = vendors.find((vendor) => vendor.code === syncVendor) ?? null;
  const syncVendorOptions = useMemo(() => [
    { value: "", label: "Select one Stone vendor" },
    ...vendors.map((vendor) => ({ value: vendor.code, label: vendor.label })),
  ], [vendors]);
  const tableVendorOptions = useMemo(() => [
    { value: "all", label: "All Stone vendors" },
    ...vendors.map((vendor) => ({ value: vendor.code, label: vendor.label })),
  ], [vendors]);
  const syncCategoryOptions = [
    { value: "all", label: "All categories" },
    ...(syncVendorOption?.categories ?? []).map((category) => ({
      value: category.key,
      label: category.productCount === null ? category.label : `${category.label} (${category.productCount})`,
    })),
  ];
  const tableVendorOption = vendors.find((vendor) => vendor.code === tableVendor) ?? null;
  const tableCategoryOptions = [
    { value: "all", label: tableVendor === "all" ? "Select a vendor first" : "All categories" },
    ...(tableVendorOption?.categories ?? []).map((category) => ({
      value: category.key,
      label: category.productCount === null ? category.label : `${category.label} (${category.productCount})`,
    })),
  ];
  const eligibleSet = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const pageEligibleIds = items.filter((item) => eligibleSet.has(item.id)).map((item) => item.id);
  const allPageEligibleSelected = pageEligibleIds.length > 0 && pageEligibleIds.every((id) => selectedIds.has(id));
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(totalCount, currentPage * pageSize);

  function resetReviewScope() {
    clearSelection();
    setCurrentPage(1);
  }

  function toggleChangeState(state: ChangeState) {
    setChangeStates((current) => current.includes(state) ? current.filter((item) => item !== state) : [...current, state]);
    resetReviewScope();
  }

  function togglePageSelection(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of pageEligibleIds) checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function syncStoneCatalog() {
    if (!syncVendor) {
      setError("Select one Stone vendor before syncing.");
      return;
    }
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      const selectedCategory = syncCategory === "all" ? null : syncVendorOption?.categories.find((category) => category.key === syncCategory) ?? null;
      const response = await fetch("/api/vendor-catalog/stone/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          vendor: syncVendor,
          categoryKey: selectedCategory?.key ?? null,
          categoryLabel: selectedCategory?.label ?? null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as StoneSyncResponse;
      if (!response.ok) throw new Error(payload.error || `Stone vendor sync failed with HTTP ${response.status}.`);
      const totals = (payload.results ?? []).reduce((sum, result) => ({
        discovered: sum.discovered + result.discovered,
        created: sum.created + result.created,
        updated: sum.updated + result.updated,
        unchanged: sum.unchanged + result.unchanged,
        failed: sum.failed + result.failed,
      }), { discovered: 0, created: 0, updated: 0, unchanged: 0, failed: 0 });
      setNotice({
        variant: totals.failed ? "warning" : "success",
        title: "Stone sync complete",
        message: `${totals.discovered} found · ${totals.created} new · ${totals.updated} updated · ${totals.unchanged} unchanged · ${totals.failed} failed.`,
      });
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function approveIds(ids: string[]) {
    if (!ids.length) return;
    setUpdatingId(ids[0]);
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      for (const itemId of ids) {
        const response = await fetch(`/api/vendor-catalog/items/${itemId}/approve`, {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const payload = (await response.json().catch(() => ({}))) as { productId?: string; error?: string };
        if (!response.ok || !payload.productId) throw new Error(payload.error || "Stone product approval failed.");
      }
      setNotice({
        variant: "success",
        title: "Stone approval complete",
        message: `${ids.length} Stone item${ids.length === 1 ? "" : "s"} linked to Product Master. Material Band remains unassigned until management prices the material.`,
      });
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : String(approveError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function approveSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkApproving(true);
    setBulkProgress({ completed: 0, total: ids.length });
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      const results: BulkResult[] = [];
      let completed = 0;
      for (const batch of chunks(ids, 5)) {
        const response = await fetch("/api/vendor-catalog/bulk/approve", {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ itemIds: batch }),
        });
        const payload = (await response.json().catch(() => ({}))) as { results?: BulkResult[]; error?: string };
        if (!response.ok) throw new Error(payload.error || `Bulk approval failed with HTTP ${response.status}.`);
        results.push(...(payload.results ?? []));
        completed += batch.length;
        setBulkProgress({ completed, total: ids.length });
      }
      const approved = results.filter((result) => result.status === "APPROVED").length;
      const skipped = results.filter((result) => result.status === "SKIPPED").length;
      const failed = results.filter((result) => result.status === "FAILED").length;
      setNotice({
        variant: skipped || failed ? "warning" : "success",
        title: "Bulk Stone approval complete",
        message: `${approved} approved · ${skipped} skipped · ${failed} failed.`,
      });
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : String(bulkError));
    } finally {
      setBulkApproving(false);
      setBulkProgress(null);
    }
  }

  async function setStatus(itemId: string, nextStatus: ReviewStatus) {
    if (nextStatus === "APPROVED") {
      await approveIds([itemId]);
      return;
    }
    setUpdatingId(itemId);
    try {
      const { error: updateError } = await supabase
        .from("vendor_catalog_items")
        .update({ review_status: nextStatus })
        .eq("id", itemId)
        .eq("catalog_domain", "stone");
      if (updateError) throw updateError;
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Alert
        variant="warning"
        title="Stone catalog boundary"
        message="Vendor availability, lot, location and quantity are reference-only and never update Modulex warehouse inventory. Stone approval creates or links Product Master data only; Material Band remains unassigned until management prices it and Store content is not auto-published."
      />
      {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
      {error ? <Alert variant="error" title="Stone vendor catalog error" message={error} /> : null}

      <ComponentCard
        title="Stone vendor sync"
        desc="Select one Stone vendor per sync. This bounded sync avoids accidentally crawling every Stone website in a single action."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="stone-sync-vendor">Stone vendor</Label>
            <Select
              id="stone-sync-vendor"
              value={syncVendor}
              options={syncVendorOptions}
              onChange={(value) => { setSyncVendor(value); setSyncCategory("all"); }}
              ariaLabel="Stone vendor to sync"
            />
          </div>
          <div>
            <Label htmlFor="stone-sync-category">Vendor category</Label>
            <Select
              id="stone-sync-category"
              value={syncCategory}
              options={syncCategoryOptions}
              onChange={setSyncCategory}
              disabled={!syncVendor}
              ariaLabel="Stone vendor category to sync"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void syncStoneCatalog()} disabled={syncing || !syncVendor}>
            {syncing ? "Syncing Stone…" : "Sync Stone Catalog"}
          </Button>
          {!syncVendor ? <Badge size="sm" color="light">Select one Stone vendor</Badge> : null}
        </div>
      </ComponentCard>

      <ComponentCard
        title="Stone catalog review"
        desc="Review Stone Type and supplier metadata, then approve selected materials into Product Master. Pricing remains a separate Material Band decision."
      >
        <form
          onSubmit={(event) => { event.preventDefault(); setQuery(safeSearch(queryInput)); resetReviewScope(); }}
          className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
        >
          <div>
            <Label htmlFor="stone-review-search">Search</Label>
            <InputField
              id="stone-review-search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Stone name, SKU or external ID"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Search</Button>
            <Button type="button" variant="outline" onClick={() => {
              setQueryInput(""); setQuery(""); setTableVendor("all"); setTableCategory("all");
              setAvailabilityFilter("all"); setLinkedFilter("all"); setReviewStatus("PENDING");
              setChangeStates(DEFAULT_CHANGE_STATES); resetReviewScope();
            }}>Clear filters</Button>
          </div>
        </form>

        <div className="grid gap-4 lg:grid-cols-4">
          <div>
            <Label htmlFor="stone-review-vendor">Vendor</Label>
            <Select id="stone-review-vendor" value={tableVendor} options={tableVendorOptions} onChange={(value) => {
              setTableVendor(value); setTableCategory("all"); resetReviewScope();
            }} ariaLabel="Filter Stone imports by vendor" />
          </div>
          <div>
            <Label htmlFor="stone-review-category">Category</Label>
            <Select id="stone-review-category" value={tableCategory} options={tableCategoryOptions} onChange={(value) => {
              setTableCategory(value); resetReviewScope();
            }} disabled={tableVendor === "all"} ariaLabel="Filter Stone imports by vendor category" />
          </div>
          <div>
            <Label htmlFor="stone-review-availability">Vendor status</Label>
            <Select id="stone-review-availability" value={availabilityFilter} options={AVAILABILITY_OPTIONS} onChange={(value) => {
              setAvailabilityFilter(value as AvailabilityFilter); resetReviewScope();
            }} ariaLabel="Filter Stone imports by vendor status" />
          </div>
          <div>
            <Label htmlFor="stone-review-linked">Linked status</Label>
            <Select id="stone-review-linked" value={linkedFilter} options={[
              { value: "all", label: "Linked / Unlinked" },
              { value: "linked", label: "Linked" },
              { value: "unlinked", label: "Unlinked" },
            ]} onChange={(value) => { setLinkedFilter(value as LinkedFilter); resetReviewScope(); }} ariaLabel="Filter linked or unlinked Stone imports" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2" aria-label="Stone review status filters">
            {REVIEW_STATUSES.map((status) => (
              <Button key={status} size="sm" variant={reviewStatus === status ? "primary" : "outline"} aria-pressed={reviewStatus === status} onClick={() => {
                setReviewStatus(status); resetReviewScope();
              }}>{status}</Button>
            ))}
          </div>
          <Badge size="sm" color="light">Showing {pageStart}–{pageEnd} of {totalCount}</Badge>
        </div>

        <fieldset className="flex flex-wrap gap-x-5 gap-y-3">
          <legend className="sr-only">Stone catalog change filters</legend>
          {CHANGE_FILTERS.map(({ state, label }) => (
            <Checkbox key={state} id={`stone-state-${state.toLowerCase()}`} label={label} checked={changeStates.includes(state)} onChange={() => toggleChangeState(state)} />
          ))}
        </fieldset>

        {reviewStatus === "PENDING" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="sm" color="light">{eligibilityLoading ? "Checking eligibility…" : `${eligibleIds.length} eligible`}</Badge>
            <Badge size="sm" color={selectedIds.size ? "primary" : "light"}>{selectedIds.size} selected</Badge>
            {eligibleIds.length > 0 && selectedIds.size !== eligibleIds.length ? (
              <Button size="sm" variant="outline" disabled={bulkApproving || eligibilityLoading} onClick={() => setSelectedIds(new Set(eligibleIds))}>
                Select all {eligibleIds.length} eligible Stone items
              </Button>
            ) : null}
            {selectedIds.size ? <Button size="sm" variant="ghost" disabled={bulkApproving} onClick={clearSelection}>Clear selection</Button> : null}
            {selectedIds.size ? (
              <Button size="sm" disabled={bulkApproving} onClick={() => void approveSelected()}>
                {bulkApproving ? `Approved ${bulkProgress?.completed ?? 0} of ${bulkProgress?.total ?? selectedIds.size}` : `Approve Selected (${selectedIds.size})`}
              </Button>
            ) : null}
          </div>
        ) : null}

        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin"><Checkbox checked={allPageEligibleSelected} onChange={togglePageSelection} disabled={!pageEligibleIds.length || bulkApproving} ariaLabel="Select approval-eligible Stone items on this page" /></TableCell>
                <TableCell isHeader variant="admin">Image</TableCell>
                <TableCell isHeader variant="admin">Vendor</TableCell>
                <TableCell isHeader variant="admin">Stone Type</TableCell>
                <TableCell isHeader variant="admin">State</TableCell>
                <TableCell isHeader variant="admin">Availability</TableCell>
                <TableCell isHeader variant="admin">Color</TableCell>
                <TableCell isHeader variant="admin">Thickness / Finish</TableCell>
                <TableCell isHeader variant="admin">Location</TableCell>
                <TableCell isHeader variant="admin">Product</TableCell>
                <TableCell isHeader variant="admin">Links</TableCell>
                <TableCell isHeader variant="admin">Last seen</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Review</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={13}>Loading Stone imports…</TableStateRow> :
               changeStates.length === 0 ? <TableStateRow colSpan={13}>Select at least one catalog state.</TableStateRow> :
               items.length === 0 ? <TableStateRow colSpan={13}>No matching Stone imports.</TableStateRow> :
               items.map((item) => {
                const inventory = item.stone_data.vendorInventory ?? [];
                const locations = uniqueStrings(inventory.map((entry) => entry.location));
                const lots = uniqueStrings(inventory.map((entry) => entry.lotNumber));
                const colors = uniqueStrings(item.stone_data.colors ?? []);
                const variant = item.stone_data.variant ?? {};
                const eligible = eligibleSet.has(item.id);
                return (
                  <TableRow key={item.id} className="align-middle">
                    <TableCell variant="admin"><Checkbox checked={selectedIds.has(item.id)} onChange={(checked) => {
                      setSelectedIds((current) => { const next = new Set(current); checked ? next.add(item.id) : next.delete(item.id); return next; });
                    }} disabled={!eligible || bulkApproving} ariaLabel={`Select ${item.sku ?? item.title} for Stone approval`} /></TableCell>
                    <TableCell variant="admin">{item.image_url ? <a href={item.image_url} target="_blank" rel="noreferrer"><img src={item.image_url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 object-contain" /></a> : <Badge size="sm" color="light">No image</Badge>}</TableCell>
                    <TableCell variant="admin"><span className="block font-medium uppercase">{item.vendor_code}</span><span className="mt-1 block text-xs opacity-70">{item.stone_data.collection ?? item.vendor_category_label ?? "—"}</span></TableCell>
                    <TableCell variant="admin">
                      <span className="block font-medium">{item.stone_type_name ?? item.stone_data.stoneTypeName ?? "Unresolved"}</span>
                      <span className="mt-1 block text-xs opacity-70">Source: {item.stone_data.sourceStoneTypeName ?? "—"}</span>
                      {item.stone_type_review_status === "pending_review" ? <Badge size="sm" color="warning">Taxonomy review pending</Badge> : null}
                    </TableCell>
                    <TableCell variant="admin"><Badge size="sm" color={changeColor(item.change_state)}>{item.change_state}</Badge></TableCell>
                    <TableCell variant="admin"><Badge size="sm" color={availabilityColor(item.availability_status)}>{availabilityLabel(item.availability_status)}</Badge>{item.vendor_stock_quantity !== null ? <span className="mt-1 block text-xs opacity-70">Vendor qty {item.vendor_stock_quantity}</span> : null}</TableCell>
                    <TableCell variant="admin"><span className="block text-sm">{colors.join(", ") || "—"}</span>{item.stone_data.colorTone ? <span className="mt-1 block text-xs opacity-70">{item.stone_data.colorTone}</span> : null}</TableCell>
                    <TableCell variant="admin"><span className="block text-sm">{[variant.thickness, variant.finish].filter(Boolean).join(" · ") || "—"}</span><span className="mt-1 block text-xs opacity-70">{[variant.form, variant.dimensions, variant.slabSizeClass].filter(Boolean).join(" · ") || "—"}</span></TableCell>
                    <TableCell variant="admin"><span className="block text-sm">{locations.join(", ") || "—"}</span>{lots.length ? <span className="mt-1 block text-xs opacity-70">Lot {lots.join(", ")}</span> : null}</TableCell>
                    <TableCell variant="admin" className="max-w-sm"><a href={item.product_url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4 transition-opacity hover:opacity-75">{item.title}</a><span className="mt-1 block font-mono text-xs opacity-70">{item.sku ?? item.external_id}</span></TableCell>
                    <TableCell variant="admin"><div className="flex flex-col gap-1 text-xs">{item.canonical_product_id ? <a href={`/products/${item.canonical_product_id}/edit`} className="underline underline-offset-4 transition-opacity hover:opacity-75">Edit Product</a> : <span>Not linked</span>}<a href={item.product_url} target="_blank" rel="noreferrer" className="underline underline-offset-4 transition-opacity hover:opacity-75">Vendor source</a></div></TableCell>
                    <TableCell variant="admin" className="whitespace-nowrap text-xs">{new Date(item.last_seen_at).toLocaleString()}</TableCell>
                    <TableCell variant="admin"><div className="flex flex-wrap justify-end gap-2">
                      {reviewStatus !== "APPROVED" ? <Button size="sm" disabled={updatingId === item.id || !eligible || bulkApproving} onClick={() => void setStatus(item.id, "APPROVED")}>{updatingId === item.id ? "Approving…" : "Approve Stone"}</Button> : null}
                      {reviewStatus !== "IGNORED" ? <Button size="sm" variant="outline" disabled={updatingId === item.id || bulkApproving} onClick={() => void setStatus(item.id, "IGNORED")}>Ignore</Button> : null}
                      {reviewStatus !== "PENDING" ? <Button size="sm" variant="ghost" disabled={updatingId === item.id || bulkApproving} onClick={() => void setStatus(item.id, "PENDING")}>Pending</Button> : null}
                    </div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="stone-review-page-size">Rows per page</Label>
            <Select id="stone-review-page-size" value={String(pageSize)} options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }} ariaLabel="Stone rows per page" />
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Stone import pagination">
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
            {pageNumbers(currentPage, totalPages).map((page) => <Button key={page} size="sm" variant={page === currentPage ? "primary" : "outline"} aria-pressed={page === currentPage} onClick={() => setCurrentPage(page)}>{page}</Button>)}
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
