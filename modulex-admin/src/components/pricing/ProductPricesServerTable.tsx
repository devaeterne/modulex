"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type ProductStatus = "active" | "inactive";
type StockFilter = "all" | "in_stock" | "out_of_stock";
type SortBy = "sku" | "name" | "brand" | "category" | "stock" | "status";
type SortDirection = "asc" | "desc";
type BulkMode = "source_percent" | "current_percent" | "current_amount" | "set_amount";

type Lookup = { id: string; name: string };
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
  summary: { total_products: number; price_groups: number; filled_prices: number; missing_prices: number };
  filters: { brands: Lookup[]; categories: Lookup[] };
  price_groups: PriceGroup[];
};

type PriceChange = { product_id: string; price_group_id: string; amount: number | null };

const pageSizes = [25, 50, 100];
const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const selectClass = inputClass;
const buttonClass = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";
const primaryButtonClass = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

function key(productId: string, groupId: string) {
  return `${productId}:${groupId}`;
}
function normalize(value: string | undefined) {
  const raw = (value ?? "").trim().replace(",", ".");
  if (!raw) return "";
  const number = Number(raw);
  return Number.isFinite(number) ? number.toFixed(4) : `invalid:${raw}`;
}
function toInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toFixed(2).replace(/\.?0+$/, "");
}
function money(value: string) {
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
}
function stock(value: string | number) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function ProductPricesServerTable() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [brands, setBrands] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [filteredIds, setFilteredIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<Payload["summary"]>({ total_products: 0, price_groups: 0, filled_prices: 0, missing_prices: 0 });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
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
      if (!raw) changes.push({ product_id, price_group_id, amount: null });
      else {
        const amount = Number(raw);
        if (Number.isFinite(amount) && amount >= 0) changes.push({ product_id, price_group_id, amount: Number(amount.toFixed(4)) });
      }
    }
    return changes;
  }, [drafts, originals]);
  const dirtyCount = dirtyChanges.length;

  useEffect(() => {
    if (!dirtyCount) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("get_product_prices_page", {
      p_query: query,
      p_page: page,
      p_page_size: pageSize,
      p_status: statusFilter === "all" ? null : statusFilter,
      p_brand_id: brandFilter || null,
      p_category_id: categoryFilter || null,
      p_stock_filter: stockFilter === "all" ? null : stockFilter,
      p_sort_by: sortBy,
      p_sort_direction: sortDirection,
      p_currency_code: "USD",
    });
    if (currentRequest !== requestId.current) return;
    if (rpcError) {
      setError(rpcError.message);
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
    setFilteredIds(payload.filtered_ids ?? []);
    setSummary(payload.summary ?? { total_products: 0, price_groups: 0, filled_prices: 0, missing_prices: 0 });
    setTotalCount(payload.total_count ?? 0);
    setTotalPages(payload.total_pages ?? 1);
    setOriginals(nextOriginals);
    setDrafts(nextOriginals);
    setSelectedIds(new Set());
    setIsLoading(false);
  }, [query, page, pageSize, statusFilter, brandFilter, categoryFilter, stockFilter, sortBy, sortDirection]);

  useEffect(() => {
    let mounted = true;
    getCurrentProfile().then(({ profile }) => {
      if (!mounted) return;
      setCanManage(profile?.role === "super_admin" || profile?.role === "admin");
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!groups.length) return;
    setBulkSourceGroupId((value) => value || groups.find((group) => group.is_base_price)?.id || groups[0].id);
    setBulkTargetGroupId((value) => value || groups.find((group) => !group.is_base_price)?.id || groups[0].id);
  }, [groups]);

  const currentPageIds = rows.map((row) => row.product_id);
  const allPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));
  const activeFilters = [query, statusFilter !== "all" ? statusFilter : "", brandFilter, categoryFilter, stockFilter !== "all" ? stockFilter : ""].filter(Boolean).length;

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
    applyNavigation(() => { setPage(1); setQuery(queryInput.trim()); });
  }
  function clearFilters() {
    applyNavigation(() => {
      setQueryInput(""); setQuery(""); setStatusFilter("all"); setBrandFilter(""); setCategoryFilter(""); setStockFilter("all"); setSortBy("sku"); setSortDirection("asc"); setPage(1);
    });
  }
  function setPrice(productId: string, groupId: string, value: string) {
    setError(null); setSuccess(null);
    setDrafts((current) => ({ ...current, [key(productId, groupId)]: value }));
  }
  function resetChanges() {
    setDrafts({ ...originals }); setError(null); setSuccess(null);
  }
  function togglePage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      currentPageIds.forEach((id) => allPageSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next;
    });
  }
  function selectAllFiltered() { setSelectedIds(new Set(filteredIds)); }

  async function hydrateSelectedPrices(ids: string[]) {
    const { data, error: rpcError } = await supabase.rpc("get_product_prices_for_products", { p_product_ids: ids, p_currency_code: "USD" });
    if (rpcError) throw rpcError;
    const nextOriginals = { ...originals };
    const nextDrafts = { ...drafts };
    for (const id of ids) for (const group of groups) {
      const priceKey = key(id, group.id);
      if (!(priceKey in nextOriginals)) { nextOriginals[priceKey] = ""; nextDrafts[priceKey] = ""; }
    }
    for (const row of (data ?? []) as { product_id: string; price_group_id: string; amount: string | number }[]) {
      const priceKey = key(row.product_id, row.price_group_id);
      if (!(priceKey in originals)) {
        const value = toInput(row.amount); nextOriginals[priceKey] = value; nextDrafts[priceKey] = value;
      }
    }
    setOriginals(nextOriginals); setDrafts(nextDrafts);
    return { nextOriginals, nextDrafts };
  }

  async function applyBulk() {
    setError(null); setSuccess(null);
    const ids = [...selectedIds];
    if (!ids.length) { setError("Select at least one product."); return; }
    const adjustment = Number(bulkValue.trim().replace(",", "."));
    if (!Number.isFinite(adjustment)) { setError("Enter a valid bulk adjustment value."); return; }
    if (!bulkTargetGroupId) { setError("Select a target price group."); return; }
    if (bulkMode === "source_percent" && (!bulkSourceGroupId || bulkSourceGroupId === bulkTargetGroupId)) { setError("Select a different source and target price group."); return; }
    try {
      const { nextDrafts } = await hydrateSelectedPrices(ids);
      const next = { ...nextDrafts };
      let applied = 0, skipped = 0;
      for (const id of ids) {
        const targetKey = key(id, bulkTargetGroupId);
        const current = Number((next[targetKey] ?? "").replace(",", "."));
        let result: number | null = null;
        if (bulkMode === "set_amount") result = adjustment;
        if (bulkMode === "current_percent" && Number.isFinite(current)) result = current * (1 + adjustment / 100);
        if (bulkMode === "current_amount" && Number.isFinite(current)) result = current + adjustment;
        if (bulkMode === "source_percent") {
          const source = Number((next[key(id, bulkSourceGroupId)] ?? "").replace(",", "."));
          if (Number.isFinite(source)) result = source * (1 + adjustment / 100);
        }
        if (result === null || !Number.isFinite(result) || result < 0) { skipped += 1; continue; }
        next[targetKey] = result.toFixed(2); applied += 1;
      }
      setDrafts(next);
      setSuccess(skipped ? `Bulk preview applied to ${applied} products; ${skipped} skipped.` : `Bulk preview applied to ${applied} products. Review and save.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load selected prices."); }
  }

  async function saveChanges() {
    setError(null); setSuccess(null);
    for (const [priceKey, value] of Object.entries(drafts)) {
      if (normalize(value) === normalize(originals[priceKey])) continue;
      const raw = value.trim().replace(",", ".");
      if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) { setError("One or more prices are invalid."); return; }
    }
    if (!dirtyChanges.length) return;
    setIsSaving(true);
    const { data, error: rpcError } = await supabase.rpc("set_product_prices_bulk", { p_changes: dirtyChanges, p_currency_code: "USD" });
    if (rpcError) { setError(rpcError.message); setIsSaving(false); return; }
    const saved = typeof data === "number" ? data : dirtyChanges.length;
    setIsSaving(false); setSuccess(`${saved} price change${saved === 1 ? "" : "s"} saved successfully.`); await load();
  }

  const start = totalCount ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, totalCount);
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, Math.min(totalPages - 4, page - 2)) + index).filter((value) => value <= totalPages);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Product Prices</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Server-side pagination, filtering and sorting. Only the current product page is loaded.</p></div>
          {canManage && <div className="flex gap-2"><button className={buttonClass} disabled={!dirtyCount || isSaving} onClick={resetChanges}>Reset</button><button className={primaryButtonClass} disabled={!dirtyCount || isSaving} onClick={saveChanges}>{isSaving ? "Saving..." : `Save Changes${dirtyCount ? ` (${dirtyCount})` : ""}`}</button></div>}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {error && <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
        {success && <div className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">{success}</div>}

        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Summary title="Products" value={summary.total_products} /><Summary title="Price Groups" value={summary.price_groups} /><Summary title="Prices Entered" value={summary.filled_prices} /><Summary title="Missing Prices" value={summary.missing_prices} />
        </div>

        <form onSubmit={submitSearch} className="mb-4 grid gap-3 lg:grid-cols-8">
          <input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder="SKU, barcode, product, brand..." className={`${inputClass} lg:col-span-2`} disabled={dirtyCount > 0} />
          <select value={statusFilter} onChange={(e) => applyNavigation(() => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); })} className={selectClass} disabled={dirtyCount > 0}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <select value={brandFilter} onChange={(e) => applyNavigation(() => { setBrandFilter(e.target.value); setPage(1); })} className={selectClass} disabled={dirtyCount > 0}><option value="">All Brands</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={categoryFilter} onChange={(e) => applyNavigation(() => { setCategoryFilter(e.target.value); setPage(1); })} className={selectClass} disabled={dirtyCount > 0}><option value="">All Categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={stockFilter} onChange={(e) => applyNavigation(() => { setStockFilter(e.target.value as StockFilter); setPage(1); })} className={selectClass} disabled={dirtyCount > 0}><option value="all">All Stock</option><option value="in_stock">In Stock</option><option value="out_of_stock">Out of Stock</option></select>
          <button className={primaryButtonClass} disabled={dirtyCount > 0}>Search</button>
          <button type="button" className={buttonClass} onClick={clearFilters} disabled={dirtyCount > 0 || activeFilters === 0}>Clear{activeFilters ? ` (${activeFilters})` : ""}</button>
        </form>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select value={sortBy} onChange={(e) => applyNavigation(() => { setSortBy(e.target.value as SortBy); setPage(1); })} className={`${selectClass} w-auto`} disabled={dirtyCount > 0}>{["sku","name","brand","category","stock","status"].map((value) => <option key={value} value={value}>Sort: {value}</option>)}</select>
          <select value={sortDirection} onChange={(e) => applyNavigation(() => { setSortDirection(e.target.value as SortDirection); setPage(1); })} className={`${selectClass} w-auto`} disabled={dirtyCount > 0}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
          <select value={pageSize} onChange={(e) => applyNavigation(() => { setPageSize(Number(e.target.value)); setPage(1); })} className={`${selectClass} w-auto`} disabled={dirtyCount > 0}>{pageSizes.map((value) => <option key={value} value={value}>{value} / page</option>)}</select>
          <span className="text-sm text-gray-500 dark:text-gray-400">Showing {start}–{end} of {totalCount}</span>
        </div>

        {canManage && <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="mb-3 flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-800 dark:text-white/90">Bulk Pricing</strong><span className="text-xs text-gray-500 dark:text-gray-400">{selectedIds.size} selected</span><button className={buttonClass} onClick={selectAllFiltered} disabled={!filteredIds.length}>Select all filtered ({filteredIds.length})</button><button className={buttonClass} onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}>Clear selection</button></div>
          <div className="grid gap-3 md:grid-cols-5">
            <select value={bulkTargetGroupId} onChange={(e) => setBulkTargetGroupId(e.target.value)} className={selectClass}>{groups.map((group) => <option key={group.id} value={group.id}>Target: {group.name}</option>)}</select>
            <select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as BulkMode)} className={selectClass}><option value="source_percent">From group %</option><option value="current_percent">Adjust current %</option><option value="current_amount">Adjust current $</option><option value="set_amount">Set exact</option></select>
            {bulkMode === "source_percent" ? <select value={bulkSourceGroupId} onChange={(e) => setBulkSourceGroupId(e.target.value)} className={selectClass}>{groups.map((group) => <option key={group.id} value={group.id}>Source: {group.name}</option>)}</select> : <div />}
            <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === "set_amount" ? "Price" : "Adjustment"} className={inputClass} />
            <button className={primaryButtonClass} onClick={applyBulk} disabled={!selectedIds.size || !bulkValue.trim()}>Apply Preview</button>
          </div>
        </div>}

        {isLoading ? <Loading /> : <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="min-w-max divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900"><tr>{canManage && <th className="px-3 py-3"><input type="checkbox" checked={allPageSelected} onChange={togglePage} /></th>}<th className="px-4 py-3 text-left text-xs uppercase text-gray-500">SKU</th><th className="min-w-[260px] px-4 py-3 text-left text-xs uppercase text-gray-500">Product</th><th className="px-4 py-3 text-right text-xs uppercase text-gray-500">Stock</th>{groups.map((group) => <th key={group.id} className="min-w-[160px] px-4 py-3 text-left text-xs uppercase text-gray-500">{group.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.length ? rows.map((row) => <tr key={row.product_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">{canManage && <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(row.product_id)} onChange={() => toggleOne(row.product_id)} /></td>}<td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{row.sku}</td><td className="px-4 py-3"><div className="text-sm text-gray-800 dark:text-white/90">{row.product_name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{[row.brand,row.category].filter(Boolean).join(" • ") || "—"}</div></td><td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{stock(row.available_stock)}</td>{groups.map((group) => { const priceKey = key(row.product_id, group.id); const value = drafts[priceKey] ?? ""; const dirty = normalize(value) !== normalize(originals[priceKey]); return <td key={group.id} className="px-4 py-3">{canManage ? <input value={value} onChange={(e) => setPrice(row.product_id, group.id, e.target.value)} className={`${inputClass} w-32 ${dirty ? "border-brand-400 ring-2 ring-brand-500/10" : ""}`} inputMode="decimal" /> : <span className="text-sm text-gray-700 dark:text-gray-300">{value ? money(value) : "—"}</span>}</td>; })}</tr>) : <tr><td colSpan={groups.length + (canManage ? 4 : 3)} className="px-6 py-14 text-center text-sm text-gray-500 dark:text-gray-400">No products found.</td></tr>}</tbody>
          </table>
        </div>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span><div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={page <= 1 || isLoading || dirtyCount > 0} onClick={() => applyNavigation(() => setPage((value) => Math.max(1, value - 1)))}>Previous</button>{visiblePages.map((value) => <button key={value} className={value === page ? primaryButtonClass : buttonClass} disabled={dirtyCount > 0} onClick={() => applyNavigation(() => setPage(value))}>{value}</button>)}<button className={buttonClass} disabled={page >= totalPages || isLoading || dirtyCount > 0} onClick={() => applyNavigation(() => setPage((value) => Math.min(totalPages, value + 1)))}>Next</button></div></div>
      </div>
    </div>
  );
}

function Summary({ title, value }: { title: string; value: number }) {
  return <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{title}</div><div className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{value.toLocaleString()}</div></div>;
}
function Loading() {
  return <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" /><p className="text-sm text-gray-500 dark:text-gray-400">Loading product prices...</p></div></div>;
}
