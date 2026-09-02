"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
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
type SortMode = "last_seen_desc" | "last_seen_asc" | "sku_asc" | "title_asc" | "family_asc";
type VendorAvailabilityStatus =
  | "AVAILABLE"
  | "OUT_OF_STOCK"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "MISSING";
type AvailabilityFilter = "all" | VendorAvailabilityStatus;

type UiAlert = {
  variant: "success" | "warning" | "info";
  title: string;
  message: string;
};

type VendorOption = { code: string; label: string };
type VendorCategory = { key: string; label: string; productCount: number | null };

type VendorCatalogItem = {
  id: string;
  vendor_code: string;
  external_id: string;
  sku: string | null;
  title: string;
  product_url: string;
  vendor_price_reference: number | null;
  vendor_currency: string | null;
  vendor_category_key: string | null;
  vendor_category_label: string | null;
  family_key: string | null;
  variant_code: string | null;
  variant_label: string | null;
  availability_status: VendorAvailabilityStatus;
  vendor_available: boolean | null;
  vendor_purchasable: boolean | null;
  vendor_stock_quantity: number | null;
  reactivation_requires_review: boolean;
  change_state: ChangeState;
  review_status: ReviewStatus;
  canonical_product_id: string | null;
  last_seen_at: string;
  image_url: string | null;
  store_product_content_id: string | null;
};

type VendorImageRow = {
  item_id: string;
  url: string;
  sort_order: number;
  storage_bucket: string | null;
  storage_path: string | null;
};

type AvailabilityCounts = {
  availabilityChanged: number;
  available: number;
  outOfStock: number;
  unavailable: number;
  unknown: number;
  missing: number;
};

type SyncResult = {
  vendorCode: string;
  categoryKey?: string | null;
  categoryLabel?: string | null;
  status: "SUCCEEDED" | "FAILED";
  counts: {
    discovered: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    availabilityChanged: number;
    available: number;
    outOfStock: number;
    unavailable: number;
    unknown: number;
    missing: number;
    canonicalDeactivated: number;
    canonicalReactivated: number;
  };
};

type SyncResponse = {
  status?: "SUCCEEDED" | "PARTIAL_FAILURE";
  results?: SyncResult[];
  error?: string;
};

type CheckResult = {
  checkId: string;
  vendorCode: string;
  categoryKey: string | null;
  categoryLabel: string | null;
  status: "SUCCEEDED" | "FAILED";
  counts: {
    discovered: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
  } & AvailabilityCounts;
  willSync: number;
  error?: string;
};

type ApproveResponse = {
  status?: "APPROVED";
  productId?: string;
  storeProductContentId?: string;
  archivedImageCount?: number;
  code?: "CATEGORY_MAPPING_REQUIRED" | "VENDOR_UNAVAILABLE" | "VENDOR_REVIEW_NOT_ELIGIBLE";
  availabilityStatus?: VendorAvailabilityStatus;
  vendorCode?: string;
  vendorCategoryKey?: string | null;
  vendorCategoryLabel?: string | null;
  error?: string;
};

type BulkResult = {
  itemId: string;
  status: "APPROVED" | "SKIPPED" | "FAILED";
  code?: string;
  error?: string;
};

type BulkApproveResponse = { results?: BulkResult[]; error?: string };
type MappingOption = { id: string; name: string; code?: string };
type ProductTypeOption = MappingOption & { default_uom_id?: string | null };
type AllowedUom = { product_type_id: string; uom_id: string };
type MappingOptionsResponse = {
  categories?: MappingOption[];
  productTypes?: ProductTypeOption[];
  uoms?: MappingOption[];
  allowedUoms?: AllowedUom[];
  error?: string;
};

type MappingRequest = {
  vendorCode: string;
  vendorCategoryKey: string | null;
  vendorCategoryLabel: string | null;
  retryIds: string[];
};

const VENDOR_CATALOG_SELECT =
  "id,vendor_code,external_id,sku,title,product_url,vendor_price_reference,vendor_currency,vendor_category_key,vendor_category_label,family_key,variant_code,variant_label,availability_status,vendor_available,vendor_purchasable,vendor_stock_quantity,reactivation_requires_review,change_state,review_status,canonical_product_id,last_seen_at" as const;
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
  { value: "all", label: "All stock states" },
  { value: "AVAILABLE", label: "Available" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "UNAVAILABLE", label: "Unavailable" },
  { value: "UNKNOWN", label: "Unknown" },
  { value: "MISSING", label: "Missing" },
];

function formatPrice(item: VendorCatalogItem) {
  if (item.vendor_price_reference === null) return "—";
  const currency = item.vendor_currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      item.vendor_price_reference
    );
  } catch {
    return `${item.vendor_price_reference} ${currency}`;
  }
}

function badgeColor(state: ChangeState): "success" | "warning" | "light" {
  if (state === "NEW") return "success";
  if (state === "UPDATED") return "warning";
  return "light";
}

function availabilityBadgeColor(
  status: VendorAvailabilityStatus
): "success" | "error" | "warning" | "light" {
  if (status === "AVAILABLE") return "success";
  if (status === "OUT_OF_STOCK" || status === "UNAVAILABLE") return "error";
  if (status === "MISSING") return "warning";
  return "light";
}

function availabilityLabel(status: VendorAvailabilityStatus) {
  if (status === "OUT_OF_STOCK") return "Out of stock";
  if (status === "UNAVAILABLE") return "Unavailable";
  if (status === "MISSING") return "Missing";
  if (status === "UNKNOWN") return "Unknown";
  return "Available";
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function safeSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function getSyncErrorMessage(status: number, payload: SyncResponse) {
  if (status === 504) {
    return "Vendor sync exceeded the server execution time limit. Run Check Updates again before retrying.";
  }
  if (status === 502 || status === 503) {
    return payload.error || "The vendor sync service is temporarily unavailable.";
  }
  if (status === 401) return "Your admin session could not be verified. Please sign in again.";
  if (status === 403) return "You do not have permission to run vendor synchronization.";
  return payload.error || `Vendor sync failed with HTTP ${status}.`;
}

export default function VendorImportsPage() {
  const requestIdRef = useRef(0);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("PENDING");
  const [changeStates, setChangeStates] = useState<ChangeState[]>(DEFAULT_CHANGE_STATES);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [categoriesByVendor, setCategoriesByVendor] = useState<Record<string, VendorCategory[]>>({});

  const [tableVendor, setTableVendor] = useState("all");
  const [tableCategory, setTableCategory] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState<LinkedFilter>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("last_seen_desc");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [syncVendor, setSyncVendor] = useState("all");
  const [syncCategory, setSyncCategory] = useState("all");
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<UiAlert | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number } | null>(null);

  const [mappingRequest, setMappingRequest] = useState<MappingRequest | null>(null);
  const [mappingOptions, setMappingOptions] = useState<MappingOptionsResponse | null>(null);
  const [mappingCategorySelection, setMappingCategorySelection] = useState("__create__");
  const [mappingCategoryName, setMappingCategoryName] = useState("");
  const [mappingProductType, setMappingProductType] = useState("");
  const [mappingUom, setMappingUom] = useState("");
  const [savingMapping, setSavingMapping] = useState(false);

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

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkProgress(null);
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
      if (!response.ok) throw new Error(payload.error || "Unable to load vendor options.");
      setVendors(payload.vendors ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [getAccessToken]);

  const ensureCategories = useCallback(
    async (vendorCode: string) => {
      if (!vendorCode || vendorCode === "all" || categoriesByVendor[vendorCode]) return;
      const accessToken = await getAccessToken();
      const response = await fetch(
        `/api/vendor-catalog/vendors?vendor=${encodeURIComponent(vendorCode)}`,
        { headers: { authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        vendor?: { categories?: VendorCategory[] };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to load vendor categories.");
      setCategoriesByVendor((current) => ({
        ...current,
        [vendorCode]: payload.vendor?.categories ?? [],
      }));
    },
    [categoriesByVendor, getAccessToken]
  );

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    if (tableVendor !== "all") {
      void ensureCategories(tableVendor).catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      );
    }
  }, [ensureCategories, tableVendor]);

  useEffect(() => {
    if (syncVendor !== "all") {
      void ensureCategories(syncVendor).catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      );
    }
  }, [ensureCategories, syncVendor]);

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
    const to = from + pageSize - 1;
    let dbQuery = supabase
      .from("vendor_catalog_items")
      .select(VENDOR_CATALOG_SELECT, { count: "exact" })
      .eq("review_status", reviewStatus)
      .in("change_state", changeStates);

    if (tableVendor !== "all") dbQuery = dbQuery.eq("vendor_code", tableVendor);
    if (tableCategory !== "all") dbQuery = dbQuery.eq("vendor_category_key", tableCategory);
    if (linkedFilter === "linked") dbQuery = dbQuery.not("canonical_product_id", "is", null);
    if (linkedFilter === "unlinked") dbQuery = dbQuery.is("canonical_product_id", null);
    if (availabilityFilter !== "all") {
      dbQuery = dbQuery.eq("availability_status", availabilityFilter);
    }
    if (query) {
      const safe = safeSearch(query);
      dbQuery = dbQuery.or(
        `sku.ilike.%${safe}%,title.ilike.%${safe}%,external_id.ilike.%${safe}%`
      );
    }

    if (sortMode === "sku_asc") {
      dbQuery = dbQuery.order("sku", { ascending: true, nullsFirst: false });
    } else if (sortMode === "title_asc") {
      dbQuery = dbQuery.order("title", { ascending: true });
    } else if (sortMode === "family_asc") {
      dbQuery = dbQuery.order("family_key", { ascending: true, nullsFirst: false });
    } else if (sortMode === "last_seen_asc") {
      dbQuery = dbQuery.order("last_seen_at", { ascending: true });
    } else {
      dbQuery = dbQuery.order("last_seen_at", { ascending: false });
    }

    const { data, count, error: queryError } = await dbQuery.range(from, to);
    if (requestId !== requestIdRef.current) return;
    if (queryError) {
      setError(queryError.message);
      setItems([]);
      setTotalCount(0);
      setTotalPages(1);
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

    const canonicalIds = rows
      .map((row) => row.canonical_product_id)
      .filter((value): value is string => Boolean(value));
    const storeByCanonical = new Map<string, string>();
    if (canonicalIds.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from("products")
        .select("id,base_product_code")
        .in("id", canonicalIds);
      if (productError) {
        setError(productError.message);
        setLoading(false);
        return;
      }
      const baseCodes = [
        ...new Set(
          (productRows ?? [])
            .map((row) => row.base_product_code)
            .filter((value): value is string => Boolean(value))
        ),
      ];
      if (baseCodes.length > 0) {
        const { data: contentRows, error: contentError } = await supabase
          .from("store_product_content")
          .select("id,base_product_code")
          .in("base_product_code", baseCodes);
        if (contentError) {
          setError(contentError.message);
          setLoading(false);
          return;
        }
        const contentByBase = new Map(
          (contentRows ?? []).map((row) => [row.base_product_code, row.id])
        );
        for (const product of productRows ?? []) {
          if (!product.base_product_code) continue;
          const contentId = contentByBase.get(product.base_product_code);
          if (contentId) storeByCanonical.set(product.id, contentId);
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
      vendor_category_key: row.vendor_category_key,
      vendor_category_label: row.vendor_category_label,
      family_key: row.family_key,
      variant_code: row.variant_code,
      variant_label: row.variant_label,
      availability_status: row.availability_status as VendorAvailabilityStatus,
      vendor_available: row.vendor_available,
      vendor_purchasable: row.vendor_purchasable,
      vendor_stock_quantity:
        row.vendor_stock_quantity === null ? null : Number(row.vendor_stock_quantity),
      reactivation_requires_review: Boolean(row.reactivation_requires_review),
      change_state: row.change_state as ChangeState,
      review_status: row.review_status as ReviewStatus,
      canonical_product_id: row.canonical_product_id,
      last_seen_at: row.last_seen_at,
      image_url: primaryImageByItem.get(row.id) ?? null,
      store_product_content_id: row.canonical_product_id
        ? storeByCanonical.get(row.canonical_product_id) ?? null
        : null,
    }));

    const nextTotalCount = count ?? 0;
    const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / pageSize));
    if (currentPage > nextTotalPages) {
      setCurrentPage(nextTotalPages);
      setLoading(false);
      return;
    }
    setItems(nextItems);
    setTotalCount(nextTotalCount);
    setTotalPages(nextTotalPages);
    setLoading(false);
  }, [
    availabilityFilter,
    changeStates,
    currentPage,
    linkedFilter,
    pageSize,
    query,
    reviewStatus,
    sortMode,
    tableCategory,
    tableVendor,
  ]);

  const loadEligibility = useCallback(async () => {
    if (reviewStatus !== "PENDING" || changeStates.length === 0) {
      setEligibleIds([]);
      return;
    }
    setEligibilityLoading(true);
    try {
      const accessToken = await getAccessToken();
      const params = new URLSearchParams({
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
      const payload = (await response.json().catch(() => ({}))) as {
        ids?: string[];
        total?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to resolve bulk approval eligibility.");
      const ids = payload.ids ?? [];
      setEligibleIds(ids);
      const eligibleSet = new Set(ids);
      setSelectedIds((current) => new Set([...current].filter((id) => eligibleSet.has(id))));
    } catch (eligibilityError) {
      setEligibleIds([]);
      setError(
        eligibilityError instanceof Error ? eligibilityError.message : String(eligibilityError)
      );
    } finally {
      setEligibilityLoading(false);
    }
  }, [
    availabilityFilter,
    changeStates,
    getAccessToken,
    linkedFilter,
    query,
    reviewStatus,
    tableCategory,
    tableVendor,
  ]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  const vendorSelectOptions = useMemo(
    () => [
      { value: "all", label: "All vendors" },
      ...vendors.map((vendor) => ({ value: vendor.code, label: vendor.label })),
    ],
    [vendors]
  );

  const tableCategoryOptions = useMemo(
    () => [
      {
        value: "all",
        label: tableVendor === "all" ? "Select a vendor first" : "All categories",
      },
      ...(tableVendor === "all" ? [] : categoriesByVendor[tableVendor] ?? []).map(
        (category) => ({
          value: category.key,
          label:
            category.productCount === null
              ? category.label
              : `${category.label} (${category.productCount})`,
        })
      ),
    ],
    [categoriesByVendor, tableVendor]
  );

  const syncCategoryOptions = useMemo(
    () => [
      { value: "all", label: "All categories" },
      ...(syncVendor === "all" ? [] : categoriesByVendor[syncVendor] ?? []).map(
        (category) => ({
          value: category.key,
          label:
            category.productCount === null
              ? category.label
              : `${category.label} (${category.productCount})`,
        })
      ),
    ],
    [categoriesByVendor, syncVendor]
  );

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = `${item.vendor_code}:${item.family_key ?? item.sku ?? item.external_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const eligibleSet = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const pageEligibleIds = useMemo(
    () => items.filter((item) => eligibleSet.has(item.id)).map((item) => item.id),
    [eligibleSet, items]
  );
  const allPageEligibleSelected =
    pageEligibleIds.length > 0 && pageEligibleIds.every((id) => selectedIds.has(id));

  const checkTotals = useMemo(
    () =>
      checkResults.reduce(
        (sum, result) => ({
          discovered: sum.discovered + result.counts.discovered,
          created: sum.created + result.counts.created,
          updated: sum.updated + result.counts.updated,
          unchanged: sum.unchanged + result.counts.unchanged,
          failed: sum.failed + result.counts.failed,
          willSync: sum.willSync + result.willSync,
          availabilityChanged:
            sum.availabilityChanged + result.counts.availabilityChanged,
          available: sum.available + result.counts.available,
          outOfStock: sum.outOfStock + result.counts.outOfStock,
          unavailable: sum.unavailable + result.counts.unavailable,
          unknown: sum.unknown + result.counts.unknown,
          missing: sum.missing + result.counts.missing,
        }),
        {
          discovered: 0,
          created: 0,
          updated: 0,
          unchanged: 0,
          failed: 0,
          willSync: 0,
          availabilityChanged: 0,
          available: 0,
          outOfStock: 0,
          unavailable: 0,
          unknown: 0,
          missing: 0,
        }
      ),
    [checkResults]
  );

  function resetPage() {
    setCurrentPage(1);
  }

  function resetReviewScope() {
    clearSelection();
    resetPage();
  }

  function toggleChangeState(state: ChangeState) {
    setChangeStates((current) =>
      current.includes(state)
        ? current.filter((item) => item !== state)
        : [...current, state]
    );
    resetReviewScope();
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(safeSearch(queryInput));
    resetReviewScope();
  }

  function clearFilters() {
    setQueryInput("");
    setQuery("");
    setTableVendor("all");
    setTableCategory("all");
    setLinkedFilter("all");
    setAvailabilityFilter("all");
    setReviewStatus("PENDING");
    setChangeStates(DEFAULT_CHANGE_STATES);
    setSortMode("last_seen_desc");
    clearSelection();
    resetPage();
  }

  function toggleRowSelection(itemId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function togglePageSelection(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of pageEligibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function runSingleCheck(vendorCode: string): Promise<CheckResult> {
    const accessToken = await getAccessToken();
    const categories = categoriesByVendor[vendorCode] ?? [];
    const selected =
      syncCategory === "all"
        ? null
        : categories.find((item) => item.key === syncCategory);
    const response = await fetch("/api/vendor-catalog/check", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        vendor: vendorCode,
        categoryKey: selected?.key ?? null,
        categoryLabel: selected?.label ?? null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as CheckResult & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || `Check Updates failed with HTTP ${response.status}.`);
    }
    return payload;
  }

  async function checkUpdates() {
    setChecking(true);
    setError(null);
    setNotice(null);
    setCheckResults([]);
    try {
      const targets =
        syncVendor === "all" ? vendors.map((vendor) => vendor.code) : [syncVendor];
      if (targets.length === 0) throw new Error("No vendor adapters are available.");
      const results: CheckResult[] = [];
      for (const vendor of targets) results.push(await runSingleCheck(vendor));
      setCheckResults(results);
      const totals = results.reduce(
        (sum, result) => ({
          discovered: sum.discovered + result.counts.discovered,
          created: sum.created + result.counts.created,
          updated: sum.updated + result.counts.updated,
          unchanged: sum.unchanged + result.counts.unchanged,
          availabilityChanged:
            sum.availabilityChanged + result.counts.availabilityChanged,
        }),
        { discovered: 0, created: 0, updated: 0, unchanged: 0, availabilityChanged: 0 }
      );
      setNotice({
        variant: "info",
        title: "Update check complete",
        message: `${totals.discovered} found · ${totals.created} new · ${totals.updated} updated · ${totals.unchanged} unchanged · ${totals.availabilityChanged} availability changes.`,
      });
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError));
    } finally {
      setChecking(false);
    }
  }

  async function syncCheckedChanges() {
    if (checkResults.length === 0) {
      setError("Run Check Updates before syncing new and updated products.");
      return;
    }
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      const results: SyncResult[] = [];
      for (const check of checkResults) {
        const response = await fetch("/api/vendor-catalog/sync", {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            vendor: check.vendorCode,
            checkId: check.checkId,
            changedOnly: true,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as SyncResponse;
        if (!response.ok && response.status !== 207) {
          throw new Error(getSyncErrorMessage(response.status, payload));
        }
        results.push(...(payload.results ?? []));
      }
      const totals = results.reduce(
        (sum, result) => ({
          discovered: sum.discovered + result.counts.discovered,
          created: sum.created + result.counts.created,
          updated: sum.updated + result.counts.updated,
          unchanged: sum.unchanged + result.counts.unchanged,
          failed: sum.failed + result.counts.failed,
          availabilityChanged:
            sum.availabilityChanged + result.counts.availabilityChanged,
          deactivated: sum.deactivated + result.counts.canonicalDeactivated,
          reactivated: sum.reactivated + result.counts.canonicalReactivated,
        }),
        {
          discovered: 0,
          created: 0,
          updated: 0,
          unchanged: 0,
          failed: 0,
          availabilityChanged: 0,
          deactivated: 0,
          reactivated: 0,
        }
      );
      setNotice({
        variant: totals.failed > 0 ? "warning" : "success",
        title: "Vendor sync complete",
        message: `${totals.discovered} checked · ${totals.created} new · ${totals.updated} updated · ${totals.availabilityChanged} availability changes · ${totals.deactivated} deactivated · ${totals.reactivated} reactivated · ${totals.failed} failed.`,
      });
      setCheckResults([]);
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function fullRescan() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      const categories = syncVendor === "all" ? [] : categoriesByVendor[syncVendor] ?? [];
      const selected =
        syncCategory === "all"
          ? null
          : categories.find((item) => item.key === syncCategory);
      const response = await fetch("/api/vendor-catalog/sync", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          syncVendor === "all"
            ? { vendors: vendors.map((vendor) => vendor.code), changedOnly: false }
            : {
                vendor: syncVendor,
                categoryKey: selected?.key ?? null,
                categoryLabel: selected?.label ?? null,
                changedOnly: false,
              }
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as SyncResponse;
      if (!response.ok && response.status !== 207) {
        throw new Error(getSyncErrorMessage(response.status, payload));
      }
      const totals = (payload.results ?? []).reduce(
        (sum, result) => ({
          discovered: sum.discovered + result.counts.discovered,
          failed: sum.failed + result.counts.failed,
          availabilityChanged:
            sum.availabilityChanged + result.counts.availabilityChanged,
        }),
        { discovered: 0, failed: 0, availabilityChanged: 0 }
      );
      setNotice({
        variant: totals.failed > 0 ? "warning" : "success",
        title: "Full rescan complete",
        message: `${totals.discovered} found · ${totals.availabilityChanged} availability changes · ${totals.failed} failed.`,
      });
      setCheckResults([]);
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function loadMappingOptions() {
    const accessToken = await getAccessToken();
    const response = await fetch("/api/vendor-catalog/category-mappings", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json().catch(() => ({}))) as MappingOptionsResponse;
    if (!response.ok) throw new Error(payload.error || "Unable to load Modulex mapping options.");
    setMappingOptions(payload);
    return payload;
  }

  async function approveIds(ids: string[]) {
    if (ids.length === 0) return;
    setUpdatingId(ids[0]);
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      let archivedImages = 0;
      for (let index = 0; index < ids.length; index += 1) {
        const itemId = ids[index];
        const response = await fetch(`/api/vendor-catalog/items/${itemId}/approve`, {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const payload = (await response.json().catch(() => ({}))) as ApproveResponse;
        if (response.status === 409 && payload.code === "CATEGORY_MAPPING_REQUIRED") {
          const request: MappingRequest = {
            vendorCode: payload.vendorCode ?? "",
            vendorCategoryKey: payload.vendorCategoryKey ?? null,
            vendorCategoryLabel: payload.vendorCategoryLabel ?? null,
            retryIds: ids.slice(index),
          };
          setMappingRequest(request);
          setMappingCategorySelection("__create__");
          setMappingCategoryName(request.vendorCategoryLabel ?? "");
          setMappingProductType("");
          setMappingUom("");
          await loadMappingOptions();
          setNotice({
            variant: "warning",
            title: "Category mapping required",
            message: request.vendorCategoryKey
              ? "Choose or create the Modulex category, then select Product Type and UOM. Approval has not been completed."
              : "This legacy row has no vendor category identity. Run a category-scoped sync before completing its import.",
          });
          return;
        }
        if (response.status === 409 && payload.code === "VENDOR_UNAVAILABLE") {
          setNotice({
            variant: "warning",
            title: "Vendor product is unavailable",
            message: payload.error || "The vendor no longer allows this product to be approved.",
          });
          await Promise.all([loadItems(), loadEligibility()]);
          return;
        }
        if (!response.ok || !payload.productId) {
          throw new Error(payload.error || "Vendor product approval failed.");
        }
        archivedImages += payload.archivedImageCount ?? 0;
      }

      setNotice({
        variant: "success",
        title: "Approval complete",
        message: `${ids.length} SKU${ids.length === 1 ? "" : "s"} approved and ${archivedImages} images archived to Modulex Storage.`,
      });
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : String(approveError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function approveFamily(item: VendorCatalogItem) {
    if (!item.family_key) {
      await approveIds([item.id]);
      return;
    }
    setUpdatingId(item.id);
    setError(null);
    try {
      const { data, error: familyError } = await supabase
        .from("vendor_catalog_items")
        .select("id")
        .eq("vendor_code", item.vendor_code)
        .eq("family_key", item.family_key)
        .eq("review_status", "PENDING")
        .eq("availability_status", "AVAILABLE")
        .order("sku", { ascending: true });
      if (familyError) throw familyError;
      await approveIds((data ?? []).map((row) => row.id));
    } catch (familyError) {
      setError(familyError instanceof Error ? familyError.message : String(familyError));
      setUpdatingId(null);
    }
  }

  async function approveSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkApproving(true);
    setBulkProgress({ completed: 0, total: ids.length });
    setError(null);
    setNotice(null);
    try {
      const accessToken = await getAccessToken();
      const allResults: BulkResult[] = [];
      let completed = 0;
      for (const batch of chunk(ids, 5)) {
        const response = await fetch("/api/vendor-catalog/bulk/approve", {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ itemIds: batch }),
        });
        const payload = (await response.json().catch(() => ({}))) as BulkApproveResponse;
        if (!response.ok) {
          throw new Error(payload.error || `Bulk approval failed with HTTP ${response.status}.`);
        }
        allResults.push(...(payload.results ?? []));
        completed += batch.length;
        setBulkProgress({ completed, total: ids.length });
      }

      const approved = allResults.filter((result) => result.status === "APPROVED").length;
      const skipped = allResults.filter((result) => result.status === "SKIPPED").length;
      const failed = allResults.filter((result) => result.status === "FAILED").length;
      setNotice({
        variant: skipped > 0 || failed > 0 ? "warning" : "success",
        title: "Bulk approval complete",
        message: `${approved} approved · ${skipped} skipped · ${failed} failed. Unavailable or unmapped products were not imported.`,
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
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("vendor_catalog_items")
        .update({ review_status: nextStatus })
        .eq("id", itemId);
      if (updateError) throw updateError;
      clearSelection();
      await Promise.all([loadItems(), loadEligibility()]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveMappingAndContinue() {
    if (!mappingRequest?.vendorCategoryKey) {
      setError("This row has no vendor category key. Run a category-scoped sync before mapping it.");
      return;
    }
    if (!mappingProductType || !mappingUom) {
      setError("Select Product Type and UOM before saving the mapping.");
      return;
    }
    if (mappingCategorySelection === "__create__" && !mappingCategoryName.trim()) {
      setError("Enter the Modulex category name to create.");
      return;
    }

    setSavingMapping(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/vendor-catalog/category-mappings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          vendorCode: mappingRequest.vendorCode,
          vendorCategoryKey: mappingRequest.vendorCategoryKey,
          vendorCategoryLabel:
            mappingRequest.vendorCategoryLabel ?? mappingRequest.vendorCategoryKey,
          modulexCategoryId:
            mappingCategorySelection === "__create__" ? null : mappingCategorySelection,
          createCategoryName:
            mappingCategorySelection === "__create__" ? mappingCategoryName.trim() : null,
          productTypeId: mappingProductType,
          uomId: mappingUom,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Category mapping could not be saved.");
      const retryIds = mappingRequest.retryIds;
      setMappingRequest(null);
      setNotice({
        variant: "success",
        title: "Category mapping saved",
        message: "The vendor category is now mapped. Continuing approval.",
      });
      await approveIds(retryIds);
    } catch (mappingError) {
      setError(mappingError instanceof Error ? mappingError.message : String(mappingError));
    } finally {
      setSavingMapping(false);
    }
  }

  const allowedMappingUoms = useMemo(() => {
    const allUoms = mappingOptions?.uoms ?? [];
    if (!mappingProductType) return allUoms;
    const allowedIds = (mappingOptions?.allowedUoms ?? [])
      .filter((row) => row.product_type_id === mappingProductType)
      .map((row) => row.uom_id);
    return allowedIds.length > 0
      ? allUoms.filter((uom) => allowedIds.includes(uom.id))
      : allUoms;
  }, [mappingOptions, mappingProductType]);

  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(totalCount, currentPage * pageSize);
  const activeFilterCount =
    [
      query,
      tableVendor !== "all",
      tableCategory !== "all",
      linkedFilter !== "all",
      availabilityFilter !== "all",
      sortMode !== "last_seen_desc",
    ].filter(Boolean).length +
    (changeStates.length === 2 &&
    changeStates.includes("NEW") &&
    changeStates.includes("UPDATED")
      ? 0
      : 1);

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Vendor Import Review" />

      <Alert
        variant="warning"
        title="Pricing and publication boundary"
        message="Vendor availability controls approval eligibility, but it is not Modulex warehouse inventory. Vendor prices are reference data only and Store publication still requires a valid Modulex selling price greater than zero."
      />

      {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
      {error ? <Alert variant="error" title="Vendor catalog error" message={error} /> : null}

      <ComponentCard
        title="Vendor sync controls"
        desc="Choose a website and optional vendor category. Availability changes are tracked separately from content changes and can deactivate or safely reactivate linked canonical SKUs."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="vendor-sync-source">Website</Label>
            <Select
              id="vendor-sync-source"
              value={syncVendor}
              options={vendorSelectOptions}
              onChange={(value) => {
                setSyncVendor(value);
                setSyncCategory("all");
                setCheckResults([]);
              }}
              ariaLabel="Vendor website to check or sync"
            />
          </div>
          <div>
            <Label htmlFor="vendor-sync-category">Vendor category</Label>
            <Select
              id="vendor-sync-category"
              value={syncCategory}
              options={syncCategoryOptions}
              onChange={(value) => {
                setSyncCategory(value);
                setCheckResults([]);
              }}
              disabled={syncVendor === "all"}
              ariaLabel="Vendor category to check or sync"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void checkUpdates()} disabled={checking || syncing}>
            {checking ? "Checking…" : "Check Updates"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void syncCheckedChanges()}
            disabled={syncing || checking || checkResults.length === 0}
          >
            {syncing
              ? "Syncing…"
              : `Sync Changes${checkResults.length > 0 ? ` (${checkTotals.willSync} content)` : ""}`}
          </Button>
          <Button variant="ghost" onClick={() => void fullRescan()} disabled={syncing || checking}>
            Full Rescan
          </Button>
        </div>

        {checkResults.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Vendor update check totals">
            <Badge size="sm" color="light">Found {checkTotals.discovered}</Badge>
            <Badge size="sm" color="success">New {checkTotals.created}</Badge>
            <Badge size="sm" color="warning">Updated {checkTotals.updated}</Badge>
            <Badge size="sm" color="light">Unchanged {checkTotals.unchanged}</Badge>
            <Badge size="sm" color="primary">Availability changed {checkTotals.availabilityChanged}</Badge>
            <Badge size="sm" color="success">Available {checkTotals.available}</Badge>
            <Badge size="sm" color="error">Out of stock {checkTotals.outOfStock}</Badge>
            <Badge size="sm" color="error">Unavailable {checkTotals.unavailable}</Badge>
            <Badge size="sm" color="light">Unknown {checkTotals.unknown}</Badge>
            {checkTotals.missing > 0 ? (
              <Badge size="sm" color="warning">Missing {checkTotals.missing}</Badge>
            ) : null}
          </div>
        ) : null}
      </ComponentCard>

      {mappingRequest ? (
        <ComponentCard
          title="Vendor Category Mapping"
          desc="Approval is paused until this vendor category is mapped to Modulex master data."
        >
          <Alert
            variant="warning"
            title="Category mapping required"
            message={
              mappingRequest.vendorCategoryKey
                ? `${mappingRequest.vendorCode} / ${mappingRequest.vendorCategoryLabel ?? mappingRequest.vendorCategoryKey} is not mapped yet.`
                : "This legacy row has no vendor category identity. Run a category-scoped sync before completing the import."
            }
          />
          {mappingRequest.vendorCategoryKey ? (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <Label htmlFor="mapping-category">Modulex category</Label>
                  <Select
                    id="mapping-category"
                    value={mappingCategorySelection}
                    options={[
                      { value: "__create__", label: "Create new category" },
                      ...(mappingOptions?.categories ?? []).map((category) => ({
                        value: category.id,
                        label: category.name,
                      })),
                    ]}
                    onChange={setMappingCategorySelection}
                    ariaLabel="Map vendor category to Modulex category"
                  />
                </div>
                <div>
                  <Label htmlFor="mapping-product-type">Product Type</Label>
                  <Select
                    id="mapping-product-type"
                    value={mappingProductType}
                    options={[
                      { value: "", label: "Select Product Type" },
                      ...(mappingOptions?.productTypes ?? []).map((type) => ({
                        value: type.id,
                        label: type.code ? `${type.name} (${type.code})` : type.name,
                      })),
                    ]}
                    onChange={(value) => {
                      setMappingProductType(value);
                      const selected = (mappingOptions?.productTypes ?? []).find(
                        (type) => type.id === value
                      );
                      setMappingUom(selected?.default_uom_id ?? "");
                    }}
                    ariaLabel="Product Type for vendor category"
                  />
                </div>
                <div>
                  <Label htmlFor="mapping-uom">UOM</Label>
                  <Select
                    id="mapping-uom"
                    value={mappingUom}
                    options={[
                      { value: "", label: "Select UOM" },
                      ...allowedMappingUoms.map((uom) => ({
                        value: uom.id,
                        label: uom.code ? `${uom.name} (${uom.code})` : uom.name,
                      })),
                    ]}
                    onChange={setMappingUom}
                    ariaLabel="UOM for vendor category"
                  />
                </div>
              </div>
              {mappingCategorySelection === "__create__" ? (
                <div>
                  <Label htmlFor="mapping-category-name">New category name</Label>
                  <InputField
                    id="mapping-category-name"
                    value={mappingCategoryName}
                    onChange={(event) => setMappingCategoryName(event.target.value)}
                    placeholder="Category name"
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveMappingAndContinue()} disabled={savingMapping}>
                  {savingMapping ? "Saving…" : "Create / Save Mapping & Continue"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMappingRequest(null)}
                  disabled={savingMapping}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : null}
        </ComponentCard>
      ) : null}

      <ComponentCard
        title="Vendor catalog review"
        desc="Filter by vendor availability, select approval-eligible rows, and approve in bounded batches. Unavailable products remain visible for tracking but cannot be imported."
      >
        <form
          onSubmit={handleSearch}
          className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
        >
          <div>
            <Label htmlFor="vendor-review-search">Search</Label>
            <InputField
              id="vendor-review-search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="SKU, product title or external ID"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Search</Button>
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>
        </form>

        <div className="grid gap-4 lg:grid-cols-5">
          <div>
            <Label htmlFor="vendor-review-vendor">Vendor</Label>
            <Select
              id="vendor-review-vendor"
              value={tableVendor}
              options={vendorSelectOptions}
              onChange={(value) => {
                setTableVendor(value);
                setTableCategory("all");
                resetReviewScope();
              }}
              ariaLabel="Filter vendor imports by vendor"
            />
          </div>
          <div>
            <Label htmlFor="vendor-review-category">Category</Label>
            <Select
              id="vendor-review-category"
              value={tableCategory}
              options={tableCategoryOptions}
              onChange={(value) => {
                setTableCategory(value);
                resetReviewScope();
              }}
              disabled={tableVendor === "all"}
              ariaLabel="Filter vendor imports by vendor category"
            />
          </div>
          <div>
            <Label htmlFor="vendor-review-availability">Stock / Availability</Label>
            <Select
              id="vendor-review-availability"
              value={availabilityFilter}
              options={AVAILABILITY_OPTIONS}
              onChange={(value) => {
                setAvailabilityFilter(value as AvailabilityFilter);
                resetReviewScope();
              }}
              ariaLabel="Filter vendor imports by availability"
            />
          </div>
          <div>
            <Label htmlFor="vendor-review-linked">Linked status</Label>
            <Select
              id="vendor-review-linked"
              value={linkedFilter}
              options={[
                { value: "all", label: "Linked / Unlinked" },
                { value: "linked", label: "Linked" },
                { value: "unlinked", label: "Unlinked" },
              ]}
              onChange={(value) => {
                setLinkedFilter(value as LinkedFilter);
                resetReviewScope();
              }}
              ariaLabel="Filter linked or unlinked vendor imports"
            />
          </div>
          <div>
            <Label htmlFor="vendor-review-sort">Sort</Label>
            <Select
              id="vendor-review-sort"
              value={sortMode}
              options={[
                { value: "last_seen_desc", label: "Last seen · newest" },
                { value: "last_seen_asc", label: "Last seen · oldest" },
                { value: "sku_asc", label: "SKU · A–Z" },
                { value: "title_asc", label: "Product · A–Z" },
                { value: "family_asc", label: "Family · A–Z" },
              ]}
              onChange={(value) => {
                setSortMode(value as SortMode);
                resetReviewScope();
              }}
              ariaLabel="Sort vendor imports"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2" aria-label="Review status filters">
            {REVIEW_STATUSES.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={reviewStatus === status ? "primary" : "outline"}
                aria-pressed={reviewStatus === status}
                onClick={() => {
                  setReviewStatus(status);
                  resetReviewScope();
                }}
              >
                {status}
              </Button>
            ))}
          </div>
          <Badge size="sm" color="light">
            Showing {pageStart}–{pageEnd} of {totalCount}
          </Badge>
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

        {reviewStatus === "PENDING" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="sm" color="light">
              {eligibilityLoading ? "Checking eligibility…" : `${eligibleIds.length} eligible`}
            </Badge>
            <Badge size="sm" color={selectedIds.size > 0 ? "primary" : "light"}>
              {selectedIds.size} selected
            </Badge>
            {eligibleIds.length > 0 && selectedIds.size !== eligibleIds.length ? (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkApproving || eligibilityLoading}
                onClick={() => setSelectedIds(new Set(eligibleIds))}
              >
                Select all {eligibleIds.length} eligible filtered products
              </Button>
            ) : null}
            {selectedIds.size > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkApproving}
                onClick={clearSelection}
              >
                Clear selection
              </Button>
            ) : null}
            {selectedIds.size > 0 ? (
              <Button
                size="sm"
                disabled={bulkApproving}
                onClick={() => void approveSelected()}
              >
                {bulkApproving
                  ? `Approved ${bulkProgress?.completed ?? 0} of ${bulkProgress?.total ?? selectedIds.size}`
                  : `Approve Selected (${selectedIds.size})`}
              </Button>
            ) : null}
          </div>
        ) : null}

        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">
                  <Checkbox
                    checked={allPageEligibleSelected}
                    onChange={togglePageSelection}
                    disabled={pageEligibleIds.length === 0 || bulkApproving}
                    ariaLabel="Select approval-eligible products on this page"
                  />
                </TableCell>
                <TableCell isHeader variant="admin">Image</TableCell>
                <TableCell isHeader variant="admin">Vendor / Category</TableCell>
                <TableCell isHeader variant="admin">State</TableCell>
                <TableCell isHeader variant="admin">Availability</TableCell>
                <TableCell isHeader variant="admin">Family / Variant</TableCell>
                <TableCell isHeader variant="admin">SKU</TableCell>
                <TableCell isHeader variant="admin">Product</TableCell>
                <TableCell isHeader variant="admin">Vendor price</TableCell>
                <TableCell isHeader variant="admin">Links</TableCell>
                <TableCell isHeader variant="admin">Last seen</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Review</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? (
                <TableStateRow colSpan={12}>Loading vendor imports…</TableStateRow>
              ) : changeStates.length === 0 ? (
                <TableStateRow colSpan={12}>Select at least one catalog state.</TableStateRow>
              ) : items.length === 0 ? (
                <TableStateRow colSpan={12}>No matching vendor imports.</TableStateRow>
              ) : (
                items.map((item) => {
                  const familyIdentity = `${item.vendor_code}:${item.family_key ?? item.sku ?? item.external_id}`;
                  const familyCount = familyCounts.get(familyIdentity) ?? 1;
                  const incompleteApproval =
                    item.review_status === "APPROVED" && !item.canonical_product_id;
                  const approvalEligible = eligibleSet.has(item.id);
                  const vendorAvailable = item.availability_status === "AVAILABLE";
                  return (
                    <TableRow key={item.id} className="align-middle">
                      <TableCell variant="admin">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onChange={(checked) => toggleRowSelection(item.id, checked)}
                          disabled={!approvalEligible || bulkApproving}
                          ariaLabel={`Select ${item.sku ?? item.title} for approval`}
                        />
                      </TableCell>
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
                      <TableCell variant="admin">
                        <span className="block font-medium uppercase">{item.vendor_code}</span>
                        <span className="mt-1 block text-xs opacity-70">
                          {item.vendor_category_label ?? "Unclassified"}
                        </span>
                      </TableCell>
                      <TableCell variant="admin">
                        <Badge size="sm" color={badgeColor(item.change_state)}>
                          {item.change_state}
                        </Badge>
                      </TableCell>
                      <TableCell variant="admin">
                        <div className="flex flex-col items-start gap-1">
                          <Badge size="sm" color={availabilityBadgeColor(item.availability_status)}>
                            {availabilityLabel(item.availability_status)}
                          </Badge>
                          {item.vendor_stock_quantity !== null ? (
                            <span className="text-xs opacity-70">
                              Vendor qty ref: {item.vendor_stock_quantity}
                            </span>
                          ) : null}
                          {item.reactivation_requires_review ? (
                            <Badge size="sm" color="warning">Reactivation review</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell variant="admin">
                        <span className="block font-mono text-xs">{item.family_key ?? "—"}</span>
                        <span className="mt-1 block text-xs opacity-70">
                          {item.variant_label ?? item.variant_code ?? "Default"}
                          {familyCount > 1 ? ` · ${familyCount} variants on page` : ""}
                        </span>
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
                      <TableCell variant="admin">
                        <div className="flex flex-col gap-1 text-xs">
                          {item.canonical_product_id ? (
                            <a
                              href={`/products/${item.canonical_product_id}/edit`}
                              className="underline underline-offset-4 transition-opacity hover:opacity-75"
                            >
                              Edit Product
                            </a>
                          ) : (
                            <span>Not linked</span>
                          )}
                          {item.store_product_content_id ? (
                            <a
                              href={`/store/products/${item.store_product_content_id}/edit`}
                              className="underline underline-offset-4 transition-opacity hover:opacity-75"
                            >
                              Edit Store Product
                            </a>
                          ) : null}
                          <a
                            href={item.product_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4 transition-opacity hover:opacity-75"
                          >
                            Vendor source
                          </a>
                        </div>
                      </TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap text-xs">
                        {new Date(item.last_seen_at).toLocaleString()}
                      </TableCell>
                      <TableCell variant="admin">
                        <div className="flex flex-wrap justify-end gap-2">
                          {incompleteApproval ? (
                            <Button
                              size="sm"
                              disabled={updatingId === item.id || !vendorAvailable || bulkApproving}
                              onClick={() => void approveIds([item.id])}
                            >
                              Complete Import
                            </Button>
                          ) : null}
                          {reviewStatus !== "APPROVED" ? (
                            <Button
                              size="sm"
                              disabled={updatingId === item.id || !vendorAvailable || bulkApproving}
                              onClick={() => void setStatus(item.id, "APPROVED")}
                            >
                              {!vendorAvailable
                                ? "Vendor unavailable"
                                : updatingId === item.id
                                  ? "Approving…"
                                  : "Approve SKU"}
                            </Button>
                          ) : null}
                          {reviewStatus === "PENDING" && item.family_key ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === item.id || !vendorAvailable || bulkApproving}
                              onClick={() => void approveFamily(item)}
                            >
                              Approve Available Family
                            </Button>
                          ) : null}
                          {reviewStatus !== "IGNORED" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === item.id || bulkApproving}
                              onClick={() => void setStatus(item.id, "IGNORED")}
                            >
                              Ignore
                            </Button>
                          ) : null}
                          {reviewStatus !== "PENDING" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updatingId === item.id || bulkApproving}
                              onClick={() => void setStatus(item.id, "PENDING")}
                            >
                              Pending
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="vendor-review-page-size">Rows per page</Label>
            <Select
              id="vendor-review-page-size"
              value={String(pageSize)}
              options={PAGE_SIZE_OPTIONS.map((size) => ({
                value: String(size),
                label: String(size),
              }))}
              onChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
              ariaLabel="Rows per page"
            />
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Vendor import pagination">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            {getPageNumbers(currentPage, totalPages).map((page) => (
              <Button
                key={page}
                size="sm"
                variant={page === currentPage ? "primary" : "outline"}
                aria-pressed={page === currentPage}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
