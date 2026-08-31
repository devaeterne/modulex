"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
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
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  calculateDbDecimalBulk,
  canonicalizeDbDecimal,
  formatDbDecimal,
  parseDbDecimal,
} from "@/lib/validation";

type ProductStatus = "active" | "inactive";
type StockFilter = "all" | "in_stock" | "out_of_stock";
type SortBy =
  | "sku"
  | "name"
  | "brand"
  | "category"
  | "product_type"
  | "uom"
  | "stock"
  | "status";
type SortDirection = "asc" | "desc";
type BulkMode = "source_percent" | "current_percent" | "current_amount" | "set_amount";

type Lookup = { id: string; name: string; code?: string };
type PriceGroup = {
  id: string;
  system_key: string;
  name: string;
  sort_order: number;
  is_base_price: boolean;
  is_active: boolean;
  color_key: string | null;
};
type ProductRow = {
  product_id: string;
  sku: string;
  barcode: string | null;
  product_name: string;
  brand_id: string | null;
  category_id: string | null;
  brand: string | null;
  category: string | null;
  product_status: ProductStatus;
  product_type_id: string;
  product_type_code: string;
  product_type_name: string;
  pricing_model: "price_group";
  uom_id: string;
  uom_code: string;
  uom_name: string;
  available_stock: string | number;
  prices: Record<string, string | number>;
};
type Payload = {
  items: ProductRow[];
  filtered_ids: string[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    total_products: number;
    price_groups: number;
    filled_prices: number;
    missing_prices: number;
  };
  routing_summary: {
    price_group_products: number;
    material_band_products: number;
    no_pricing_products: number;
  };
  filters: {
    brands: Lookup[];
    categories: Lookup[];
    product_types: Lookup[];
    uoms: Lookup[];
  };
  price_groups: PriceGroup[];
};
type PriceChange = { product_id: string; price_group_id: string; amount: string | null };

const pageSizes = [25, 50, 100];
const PRICE_DECIMAL = { precision: 18, scale: 4, min: 0, allowNull: true } as const;

function key(productId: string, groupId: string) {
  return `${productId}:${groupId}`;
}

function normalize(value: string | undefined) {
  const parsed = parseDbDecimal(value, PRICE_DECIMAL);
  return parsed.error
    ? `invalid:${(value ?? "").trim()}`
    : canonicalizeDbDecimal(parsed.value, PRICE_DECIMAL);
}

function toInput(value: string | number | null | undefined) {
  return formatDbDecimal(value, PRICE_DECIMAL);
}

function money(value: string) {
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
}

function stock(value: string | number) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function pricingErrorMessage(message: string) {
  if (message.includes("does not use Price Group pricing")) {
    return "This product uses a different pricing engine and cannot receive a Price Group price.";
  }
  if (message.includes("permission")) {
    return "You do not have permission to manage product prices.";
  }
  return "Product pricing could not be loaded or saved. Please retry.";
}

export default function ProductPricesServerTable() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [brands, setBrands] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [productTypes, setProductTypes] = useState<Lookup[]>([]);
  const [uoms, setUoms] = useState<Lookup[]>([]);
  const [filteredIds, setFilteredIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<Payload["summary"]>({
    total_products: 0,
    price_groups: 0,
    filled_prices: 0,
    missing_prices: 0,
  });
  const [routingSummary, setRoutingSummary] = useState<Payload["routing_summary"]>({
    price_group_products: 0,
    material_band_products: 0,
    no_pricing_products: 0,
  });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("");
  const [uomFilter, setUomFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("sku");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState<BulkMode>("source_percent");
  const [bulkSourceGroupId, setBulkSourceGroupId] = useState("");
  const [bulkTargetGroupId, setBulkTargetGroupId] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const requestId = useRef(0);

  const dirtyChanges = useMemo(() => {
    const changes: PriceChange[] = [];
    for (const [priceKey, current] of Object.entries(drafts)) {
      if (normalize(current) === normalize(originals[priceKey])) continue;
      const [product_id, price_group_id] = priceKey.split(":");
      const raw = current.trim().replace(",", ".");
      if (!raw) {
        changes.push({ product_id, price_group_id, amount: null });
        continue;
      }
      const amount = parseDbDecimal(raw, PRICE_DECIMAL);
      if (!amount.error) changes.push({ product_id, price_group_id, amount: amount.value });
    }
    return changes;
  }, [drafts, originals]);
  const dirtyCount = dirtyChanges.length;

  useEffect(() => {
    if (!dirtyCount) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("get_product_prices_page_v2", {
      p_query: query,
      p_page: page,
      p_page_size: pageSize,
      p_status: statusFilter === "all" ? null : statusFilter,
      p_brand_id: brandFilter || null,
      p_category_id: categoryFilter || null,
      p_stock_filter: stockFilter === "all" ? null : stockFilter,
      p_product_type_id: productTypeFilter || null,
      p_uom_id: uomFilter || null,
      p_sort_by: sortBy,
      p_sort_direction: sortDirection,
      p_currency_code: "USD",
    });

    if (currentRequest !== requestId.current) return;
    if (rpcError) {
      setRows([]);
      setError(pricingErrorMessage(rpcError.message));
      setIsLoading(false);
      return;
    }

    const payload = data as Payload;
    if (page > payload.total_pages) {
      setPage(payload.total_pages);
      return;
    }

    const nextOriginals: Record<string, string> = {};
    for (const product of payload.items ?? []) {
      for (const group of payload.price_groups ?? []) {
        const priceKey = key(product.product_id, group.id);
        nextOriginals[priceKey] = toInput(product.prices?.[group.id]);
      }
    }

    setRows(payload.items ?? []);
    setGroups(payload.price_groups ?? []);
    setBrands(payload.filters?.brands ?? []);
    setCategories(payload.filters?.categories ?? []);
    setProductTypes(payload.filters?.product_types ?? []);
    setUoms(payload.filters?.uoms ?? []);
    setFilteredIds(payload.filtered_ids ?? []);
    setSummary(
      payload.summary ?? {
        total_products: 0,
        price_groups: 0,
        filled_prices: 0,
        missing_prices: 0,
      }
    );
    setRoutingSummary(
      payload.routing_summary ?? {
        price_group_products: 0,
        material_band_products: 0,
        no_pricing_products: 0,
      }
    );
    setTotalCount(payload.total_count ?? 0);
    setTotalPages(payload.total_pages ?? 1);
    setOriginals(nextOriginals);
    setDrafts(nextOriginals);
    setSelectedIds(new Set());
    setIsLoading(false);
  }, [
    query,
    page,
    pageSize,
    statusFilter,
    brandFilter,
    categoryFilter,
    productTypeFilter,
    uomFilter,
    stockFilter,
    sortBy,
    sortDirection,
  ]);

  useEffect(() => {
    let mounted = true;
    getCurrentProfile().then(({ profile }) => {
      if (!mounted) return;
      setCanManage(hasPermission(profile?.roles, "pricing.manage"));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!groups.length) return;
    setBulkSourceGroupId(
      (value) => value || groups.find((group) => group.is_base_price)?.id || groups[0].id
    );
    setBulkTargetGroupId(
      (value) => value || groups.find((group) => !group.is_base_price)?.id || groups[0].id
    );
  }, [groups]);

  const currentPageIds = rows.map((row) => row.product_id);
  const allPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));
  const activeFilters = [
    query,
    statusFilter !== "all" ? statusFilter : "",
    brandFilter,
    categoryFilter,
    productTypeFilter,
    uomFilter,
    stockFilter !== "all" ? stockFilter : "",
  ].filter(Boolean).length;

  function ensureNoDirty() {
    if (!dirtyCount) return true;
    setError("Save or reset unsaved price changes before changing page, filters or sort order.");
    return false;
  }

  function applyNavigation(action: () => void) {
    if (!ensureNoDirty()) return;
    setSuccess(null);
    action();
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    applyNavigation(() => {
      setPage(1);
      setQuery(queryInput.trim());
    });
  }

  function clearFilters() {
    applyNavigation(() => {
      setQueryInput("");
      setQuery("");
      setStatusFilter("all");
      setBrandFilter("");
      setCategoryFilter("");
      setProductTypeFilter("");
      setUomFilter("");
      setStockFilter("all");
      setSortBy("sku");
      setSortDirection("asc");
      setPage(1);
    });
  }

  function setPrice(productId: string, groupId: string, value: string) {
    setError(null);
    setSuccess(null);
    setDrafts((current) => ({ ...current, [key(productId, groupId)]: value }));
  }

  function resetChanges() {
    setDrafts({ ...originals });
    setError(null);
    setSuccess(null);
  }

  function togglePage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      currentPageIds.forEach((id) => (allPageSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filteredIds));
  }

  async function hydrateSelectedPrices(ids: string[]) {
    const { data, error: rpcError } = await supabase.rpc("get_product_prices_for_products", {
      p_product_ids: ids,
      p_currency_code: "USD",
    });
    if (rpcError) throw rpcError;

    const nextOriginals = { ...originals };
    const nextDrafts = { ...drafts };
    for (const id of ids) {
      for (const group of groups) {
        const priceKey = key(id, group.id);
        if (!(priceKey in nextOriginals)) {
          nextOriginals[priceKey] = "";
          nextDrafts[priceKey] = "";
        }
      }
    }

    for (const row of (data ?? []) as {
      product_id: string;
      price_group_id: string;
      amount: string | number;
    }[]) {
      const priceKey = key(row.product_id, row.price_group_id);
      if (!(priceKey in originals)) {
        const value = toInput(row.amount);
        nextOriginals[priceKey] = value;
        nextDrafts[priceKey] = value;
      }
    }

    setOriginals(nextOriginals);
    setDrafts(nextDrafts);
    return { nextOriginals, nextDrafts };
  }

  async function applyBulk() {
    setError(null);
    setSuccess(null);
    const ids = [...selectedIds];
    if (!ids.length) {
      setError("Select at least one product.");
      return;
    }
    const adjustment = bulkValue.trim().replace(",", ".");
    if (!adjustment) {
      setError("Enter a valid bulk adjustment value.");
      return;
    }
    if (!bulkTargetGroupId) {
      setError("Select a target price group.");
      return;
    }
    if (
      bulkMode === "source_percent" &&
      (!bulkSourceGroupId || bulkSourceGroupId === bulkTargetGroupId)
    ) {
      setError("Select a different source and target price group.");
      return;
    }

    try {
      const { nextDrafts } = await hydrateSelectedPrices(ids);
      const next = { ...nextDrafts };
      let applied = 0;
      let skipped = 0;

      for (const id of ids) {
        const targetKey = key(id, bulkTargetGroupId);
        const source =
          bulkMode === "source_percent"
            ? next[key(id, bulkSourceGroupId)] ?? null
            : next[targetKey] ?? null;
        const result = calculateDbDecimalBulk(source, adjustment, bulkMode, PRICE_DECIMAL);
        if (result.error || result.value === null) {
          skipped += 1;
          continue;
        }
        next[targetKey] = result.value;
        applied += 1;
      }

      setDrafts(next);
      setSuccess(
        skipped
          ? `Bulk preview applied to ${applied} products; ${skipped} skipped.`
          : `Bulk preview applied to ${applied} products. Review and save.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? pricingErrorMessage(caught.message) : "Unable to load selected prices.");
    }
  }

  async function saveChanges() {
    setError(null);
    setSuccess(null);

    for (const [priceKey, value] of Object.entries(drafts)) {
      if (normalize(value) === normalize(originals[priceKey])) continue;
      const parsed = parseDbDecimal(value, PRICE_DECIMAL);
      if (parsed.error) {
        setError(`Price: ${parsed.error}`);
        return;
      }
    }
    if (!dirtyChanges.length) return;

    setIsSaving(true);
    const { data, error: rpcError } = await supabase.rpc("set_product_prices_bulk", {
      p_changes: dirtyChanges,
      p_currency_code: "USD",
    });
    if (rpcError) {
      setError(pricingErrorMessage(rpcError.message));
      setIsSaving(false);
      return;
    }

    const saved = typeof data === "number" ? data : dirtyChanges.length;
    setIsSaving(false);
    setSuccess(`${saved} price change${saved === 1 ? "" : "s"} saved successfully.`);
    await load();
  }

  const start = totalCount ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalCount);
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => Math.max(1, Math.min(totalPages - 4, page - 2)) + index
  ).filter((value) => value <= totalPages);
  const tableColumnCount = groups.length + (canManage ? 6 : 5);

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Product Prices"
        desc="Manage Price Group pricing only. Product Type routes each product to its supported pricing engine."
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge color="primary">Price Group: {routingSummary.price_group_products}</Badge>
            <Badge color="warning">Material Band: {routingSummary.material_band_products}</Badge>
            <Badge color="light">No Pricing: {routingSummary.no_pricing_products}</Badge>
            <Link href="/pricing/material-bands">
              <Badge color="info">Manage Material Bands</Badge>
            </Link>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!dirtyCount || isSaving} onClick={resetChanges}>
                Reset
              </Button>
              <Button disabled={!dirtyCount || isSaving} onClick={() => void saveChanges()}>
                {isSaving ? "Saving…" : `Save Changes${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </Button>
            </div>
          ) : null}
        </div>
      </ComponentCard>

      {error ? <Alert variant="error" title="Pricing unavailable" message={error} /> : null}
      {success ? <Alert variant="success" title="Pricing updated" message={success} /> : null}

      <ComponentCard title="Pricing Summary" desc="Current USD Price Group coverage for eligible products.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <small>Products</small>
            <div><strong>{summary.total_products.toLocaleString()}</strong></div>
          </div>
          <div>
            <small>Price Groups</small>
            <div><strong>{summary.price_groups.toLocaleString()}</strong></div>
          </div>
          <div>
            <small>Prices Entered</small>
            <div><strong>{summary.filled_prices.toLocaleString()}</strong></div>
          </div>
          <div>
            <small>Missing Prices</small>
            <div><strong>{summary.missing_prices.toLocaleString()}</strong></div>
          </div>
        </div>
      </ComponentCard>

      <ComponentCard title="Filters" desc="Search and filter the server-side Price Group product directory.">
        <form onSubmit={submitSearch} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="pricing-product-search">Search</Label>
            <Input
              id="pricing-product-search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="SKU, barcode, product, brand, Product Type or UOM"
              disabled={dirtyCount > 0}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              options={[
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              value={statusFilter}
              onChange={(value) =>
                applyNavigation(() => {
                  setStatusFilter(value as typeof statusFilter);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Stock</Label>
            <Select
              options={[
                { value: "all", label: "All Stock" },
                { value: "in_stock", label: "In Stock" },
                { value: "out_of_stock", label: "Out of Stock" },
              ]}
              value={stockFilter}
              onChange={(value) =>
                applyNavigation(() => {
                  setStockFilter(value as StockFilter);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Brand</Label>
            <Select
              allowEmpty
              placeholder="All Brands"
              options={brands.map((item) => ({ value: item.id, label: item.name }))}
              value={brandFilter}
              onChange={(value) =>
                applyNavigation(() => {
                  setBrandFilter(value);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              allowEmpty
              placeholder="All Categories"
              options={categories.map((item) => ({ value: item.id, label: item.name }))}
              value={categoryFilter}
              onChange={(value) =>
                applyNavigation(() => {
                  setCategoryFilter(value);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Product Type</Label>
            <Select
              allowEmpty
              placeholder="All Product Types"
              options={productTypes.map((item) => ({
                value: item.id,
                label: item.code ? `${item.name} (${item.code})` : item.name,
              }))}
              value={productTypeFilter}
              onChange={(value) =>
                applyNavigation(() => {
                  setProductTypeFilter(value);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Unit of Measure</Label>
            <Select
              allowEmpty
              placeholder="All Units"
              options={uoms.map((item) => ({
                value: item.id,
                label: item.code ? `${item.name} (${item.code})` : item.name,
              }))}
              value={uomFilter}
              onChange={(value) =>
                applyNavigation(() => {
                  setUomFilter(value);
                  setPage(1);
                })
              }
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
            <Button type="submit" disabled={dirtyCount > 0}>Search</Button>
            <Button
              variant="outline"
              disabled={dirtyCount > 0 || activeFilters === 0}
              onClick={clearFilters}
            >
              Clear{activeFilters ? ` (${activeFilters})` : ""}
            </Button>
          </div>
        </form>
      </ComponentCard>

      <ComponentCard title="Directory Controls" desc={`Showing ${start}–${end} of ${totalCount} eligible products.`}>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <div>
            <Label>Sort By</Label>
            <Select
              options={[
                { value: "sku", label: "SKU" },
                { value: "name", label: "Product Name" },
                { value: "brand", label: "Brand" },
                { value: "category", label: "Category" },
                { value: "product_type", label: "Product Type" },
                { value: "uom", label: "Unit of Measure" },
                { value: "stock", label: "Stock" },
                { value: "status", label: "Status" },
              ]}
              value={sortBy}
              onChange={(value) =>
                applyNavigation(() => {
                  setSortBy(value as SortBy);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Direction</Label>
            <Select
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
              value={sortDirection}
              onChange={(value) =>
                applyNavigation(() => {
                  setSortDirection(value as SortDirection);
                  setPage(1);
                })
              }
            />
          </div>
          <div>
            <Label>Page Size</Label>
            <Select
              options={pageSizes.map((value) => ({ value: String(value), label: `${value} / page` }))}
              value={String(pageSize)}
              onChange={(value) =>
                applyNavigation(() => {
                  setPageSize(Number(value));
                  setPage(1);
                })
              }
            />
          </div>
        </div>
      </ComponentCard>

      {canManage ? (
        <ComponentCard
          title="Bulk Pricing"
          desc="Bulk operations only receive products already routed to Price Group pricing."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="light">{selectedIds.size} selected</Badge>
              <Button variant="outline" disabled={!filteredIds.length} onClick={selectAllFiltered}>
                Select all filtered ({filteredIds.length})
              </Button>
              <Button
                variant="outline"
                disabled={!selectedIds.size}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <Label>Target Price Group</Label>
                <Select
                  options={groups.map((group) => ({ value: group.id, label: group.name }))}
                  value={bulkTargetGroupId}
                  onChange={setBulkTargetGroupId}
                />
              </div>
              <div>
                <Label>Bulk Mode</Label>
                <Select
                  options={[
                    { value: "source_percent", label: "From group %" },
                    { value: "current_percent", label: "Adjust current %" },
                    { value: "current_amount", label: "Adjust current $" },
                    { value: "set_amount", label: "Set exact" },
                  ]}
                  value={bulkMode}
                  onChange={(value) => setBulkMode(value as BulkMode)}
                />
              </div>
              {bulkMode === "source_percent" ? (
                <div>
                  <Label>Source Price Group</Label>
                  <Select
                    options={groups.map((group) => ({ value: group.id, label: group.name }))}
                    value={bulkSourceGroupId}
                    onChange={setBulkSourceGroupId}
                  />
                </div>
              ) : <div />}
              <div>
                <Label htmlFor="bulk-price-value">Value</Label>
                <Input
                  id="bulk-price-value"
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  placeholder={bulkMode === "set_amount" ? "Price" : "Adjustment"}
                  inputMode="decimal"
                />
              </div>
              <div className="flex items-end">
                <Button
                  disabled={!selectedIds.size || !bulkValue.trim()}
                  onClick={() => void applyBulk()}
                >
                  Apply Preview
                </Button>
              </div>
            </div>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard
        title="Price Group Matrix"
        desc="Stone/material-band and no-pricing products are intentionally excluded from this matrix."
      >
        {isLoading ? (
          <Alert variant="info" title="Loading product prices" message="Loading the current server page." />
        ) : (
          <TableViewport>
            <Table variant="admin" className="min-w-[1280px]">
              <TableHeader variant="admin">
                <TableRow>
                  {canManage ? (
                    <TableCell isHeader variant="admin">
                      <Checkbox checked={allPageSelected} onChange={togglePage} />
                    </TableCell>
                  ) : null}
                  <TableCell isHeader variant="admin" className="text-left">SKU</TableCell>
                  <TableCell isHeader variant="admin" className="text-left">Product</TableCell>
                  <TableCell isHeader variant="admin" className="text-left">Product Type</TableCell>
                  <TableCell isHeader variant="admin" className="text-left">Unit of Measure</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Stock</TableCell>
                  {groups.map((group) => (
                    <TableCell key={group.id} isHeader variant="admin" className="text-left">
                      {group.name}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.product_id}>
                      {canManage ? (
                        <TableCell variant="admin">
                          <Checkbox
                            checked={selectedIds.has(row.product_id)}
                            onChange={() => toggleOne(row.product_id)}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell variant="admin"><strong>{row.sku}</strong></TableCell>
                      <TableCell variant="admin">
                        <div className="space-y-1">
                          <div>{row.product_name}</div>
                          <small>{[row.brand, row.category].filter(Boolean).join(" • ") || "—"}</small>
                        </div>
                      </TableCell>
                      <TableCell variant="admin">
                        <div className="flex flex-wrap gap-1">
                          <Badge color="primary" size="sm">{row.product_type_name}</Badge>
                          <Badge color="light" size="sm">{row.product_type_code}</Badge>
                        </div>
                      </TableCell>
                      <TableCell variant="admin">
                        <Badge color="info" size="sm">{row.uom_name} ({row.uom_code})</Badge>
                      </TableCell>
                      <TableCell variant="admin" className="text-right">
                        {stock(row.available_stock)}
                      </TableCell>
                      {groups.map((group) => {
                        const priceKey = key(row.product_id, group.id);
                        const value = drafts[priceKey] ?? "";
                        const parsed = parseDbDecimal(value, PRICE_DECIMAL);
                        return (
                          <TableCell key={group.id} variant="admin">
                            {canManage ? (
                              <div className="w-36">
                                <Input
                                  value={value}
                                  onChange={(event) => setPrice(row.product_id, group.id, event.target.value)}
                                  inputMode="decimal"
                                  error={Boolean(value.trim() && parsed.error)}
                                />
                              </div>
                            ) : (
                              <span>{value ? money(value) : "—"}</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell variant="admin" colSpan={tableColumnCount} className="text-center">
                      No Price Group products match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableViewport>
        )}
      </ComponentCard>

      <ComponentCard title="Pagination" desc={`Page ${page} of ${totalPages}`}>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || isLoading || dirtyCount > 0}
            onClick={() => applyNavigation(() => setPage((value) => Math.max(1, value - 1)))}
          >
            Previous
          </Button>
          {visiblePages.map((value) => (
            <Button
              key={value}
              variant={value === page ? "primary" : "outline"}
              disabled={dirtyCount > 0}
              onClick={() => applyNavigation(() => setPage(value))}
            >
              {value}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={page >= totalPages || isLoading || dirtyCount > 0}
            onClick={() =>
              applyNavigation(() => setPage((value) => Math.min(totalPages, value + 1)))
            }
          >
            Next
          </Button>
        </div>
      </ComponentCard>
    </div>
  );
}
