"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

type ProductStatus = "active" | "inactive";
type StockFilter = "all" | "in_stock" | "out_of_stock";
type MarginFilter = "all" | "healthy" | "warning" | "critical" | "loss" | "missing_cost" | "no_price";
type SortBy = "sku" | "name" | "brand" | "category" | "stock" | "status" | "cost" | "margin";
type SortDirection = "asc" | "desc";
type BulkMode = "current_percent" | "current_amount" | "set_amount";
type Lookup = { id: string; name: string };
type PriceGroup = { id: string; system_key: string; name: string; sort_order: number; is_base_price: boolean; is_active: boolean; color_key: string | null };
type Row = {
  product_id: string; sku: string; barcode: string | null; product_name: string; brand_id: string | null; category_id: string | null;
  brand: string | null; category: string | null; product_status: ProductStatus; available_stock: string | number;
  cost_amount: string | number | null; min_margin_override: string | number | null; effective_min_margin: string | number;
  warning_buffer: string | number; margin_health: Exclude<MarginFilter, "all">; worst_margin: string | number | null;
  prices: Record<string, string | number>;
};
type Payload = {
  items: Row[]; filtered_ids: string[]; total_count: number; page: number; page_size: number; total_pages: number;
  summary: { total_products: number; products_with_cost: number; missing_cost: number; below_margin: number; healthy: number };
  filters: { brands: Lookup[]; categories: Lookup[] }; price_groups: PriceGroup[];
  settings: { default_min_margin_percent: string | number; warning_margin_buffer_percent: string | number; currency_code: string };
};

const pageSizes = [25, 50, 100];
const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonClass = "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";
const primaryButtonClass = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

function normalize(value: string | undefined) { const raw = (value ?? "").trim().replace(",", "."); if (!raw) return ""; const number = Number(raw); return Number.isFinite(number) ? number.toFixed(4) : `invalid:${raw}`; }
function toInput(value: string | number | null | undefined) { if (value === null || value === undefined || value === "") return ""; const number = Number(value); return Number.isFinite(number) ? number.toFixed(2).replace(/\.?0+$/, "") : ""; }
function parse(value: string | undefined) { const raw = (value ?? "").trim().replace(",", "."); if (!raw) return null; const number = Number(raw); return Number.isFinite(number) ? number : null; }
function money(value: number | null) { return value === null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
function stock(value: string | number) { return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function margin(price: number | null, cost: number | null) { return price === null || cost === null || price <= 0 ? null : ((price - cost) / price) * 100; }
function health(margins: (number | null)[], cost: number | null, min: number, buffer: number): Exclude<MarginFilter, "all"> {
  if (cost === null) return "missing_cost";
  const valid = margins.filter((value): value is number => value !== null);
  if (!valid.length) return "no_price";
  const worst = Math.min(...valid);
  if (worst < 0) return "loss";
  if (worst < min - buffer) return "critical";
  if (worst < min) return "warning";
  return "healthy";
}
function healthClass(value: Exclude<MarginFilter, "all">) {
  if (value === "healthy") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (value === "warning") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  if (value === "critical" || value === "loss") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

export default function CostMarginServerTable() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [brands, setBrands] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [filteredIds, setFilteredIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<Payload["summary"]>({ total_products: 0, products_with_cost: 0, missing_cost: 0, below_margin: 0, healthy: 0 });
  const [queryInput, setQueryInput] = useState(""); const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all"); const [brandFilter, setBrandFilter] = useState(""); const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all"); const [marginFilter, setMarginFilter] = useState<MarginFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("sku"); const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(50); const [totalCount, setTotalCount] = useState(0); const [totalPages, setTotalPages] = useState(1);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({}); const [costOriginals, setCostOriginals] = useState<Record<string, string>>({});
  const [marginDrafts, setMarginDrafts] = useState<Record<string, string>>({}); const [marginOriginals, setMarginOriginals] = useState<Record<string, string>>({});
  const [defaultMin, setDefaultMin] = useState("20"); const [originalDefaultMin, setOriginalDefaultMin] = useState("20"); const [warningBuffer, setWarningBuffer] = useState("5"); const [originalWarningBuffer, setOriginalWarningBuffer] = useState("5");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); const [bulkMode, setBulkMode] = useState<BulkMode>("current_percent"); const [bulkValue, setBulkValue] = useState("");
  const [isLoading, setIsLoading] = useState(true); const [isSaving, setIsSaving] = useState(false); const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null); const requestId = useRef(0);

  const costDirtyIds = useMemo(() => Object.keys(costDrafts).filter((id) => normalize(costDrafts[id]) !== normalize(costOriginals[id])), [costDrafts, costOriginals]);
  const marginDirtyIds = useMemo(() => Object.keys(marginDrafts).filter((id) => normalize(marginDrafts[id]) !== normalize(marginOriginals[id])), [marginDrafts, marginOriginals]);
  const dirtyCount = costDirtyIds.length + marginDirtyIds.length;
  const settingsDirty = normalize(defaultMin) !== normalize(originalDefaultMin) || normalize(warningBuffer) !== normalize(originalWarningBuffer);
  useEffect(() => { if (!dirtyCount && !settingsDirty) return; const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirtyCount, settingsDirty]);

  useEffect(() => { let mounted = true; getCurrentProfile().then(({ profile }) => { if (!mounted) return; setHasAccess(hasPermission(profile?.roles, "pricing.cost.view")); }); return () => { mounted = false; }; }, []);

  const load = useCallback(async () => {
    if (hasAccess !== true) return;
    const currentRequest = ++requestId.current; setIsLoading(true); setError(null);
    const { data, error: rpcError } = await supabase.rpc("get_cost_margin_page", {
      p_query: query, p_page: page, p_page_size: pageSize, p_status: statusFilter === "all" ? null : statusFilter,
      p_brand_id: brandFilter || null, p_category_id: categoryFilter || null, p_stock_filter: stockFilter === "all" ? null : stockFilter,
      p_margin_filter: marginFilter === "all" ? null : marginFilter, p_sort_by: sortBy, p_sort_direction: sortDirection, p_currency_code: "USD",
    });
    if (currentRequest !== requestId.current) return;
    if (rpcError) { setError(rpcError.message); setIsLoading(false); return; }
    const payload = data as Payload;
    if (page > payload.total_pages) { setPage(payload.total_pages); return; }
    const nextCosts: Record<string, string> = {}; const nextMargins: Record<string, string> = {};
    for (const row of payload.items ?? []) { nextCosts[row.product_id] = toInput(row.cost_amount); nextMargins[row.product_id] = toInput(row.min_margin_override); }
    setRows(payload.items ?? []); setGroups(payload.price_groups ?? []); setBrands(payload.filters?.brands ?? []); setCategories(payload.filters?.categories ?? []); setFilteredIds(payload.filtered_ids ?? []);
    setSummary(payload.summary ?? { total_products: 0, products_with_cost: 0, missing_cost: 0, below_margin: 0, healthy: 0 }); setTotalCount(payload.total_count ?? 0); setTotalPages(payload.total_pages ?? 1);
    setCostOriginals(nextCosts); setCostDrafts(nextCosts); setMarginOriginals(nextMargins); setMarginDrafts(nextMargins); setSelectedIds(new Set());
    const min = toInput(payload.settings?.default_min_margin_percent ?? 20); const buffer = toInput(payload.settings?.warning_margin_buffer_percent ?? 5);
    setDefaultMin(min); setOriginalDefaultMin(min); setWarningBuffer(buffer); setOriginalWarningBuffer(buffer); setIsLoading(false);
  }, [hasAccess, query, page, pageSize, statusFilter, brandFilter, categoryFilter, stockFilter, marginFilter, sortBy, sortDirection]);
  useEffect(() => { void load(); }, [load]);

  const currentPageIds = rows.map((row) => row.product_id); const allPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));
  const activeFilters = [query, statusFilter !== "all" ? statusFilter : "", brandFilter, categoryFilter, stockFilter !== "all" ? stockFilter : "", marginFilter !== "all" ? marginFilter : ""].filter(Boolean).length;
  function ensureClean() { if (!dirtyCount) return true; setError("Save or reset unsaved cost/margin changes before changing page, filters or sort order."); return false; }
  function navigate(action: () => void) { if (!ensureClean()) return; setSuccess(null); action(); }
  function submitSearch(event: FormEvent) { event.preventDefault(); navigate(() => { setPage(1); setQuery(queryInput.trim()); }); }
  function clearFilters() { navigate(() => { setQueryInput(""); setQuery(""); setStatusFilter("all"); setBrandFilter(""); setCategoryFilter(""); setStockFilter("all"); setMarginFilter("all"); setSortBy("sku"); setSortDirection("asc"); setPage(1); }); }
  function togglePage() { setSelectedIds((current) => { const next = new Set(current); currentPageIds.forEach((id) => allPageSelected ? next.delete(id) : next.add(id)); return next; }); }
  function toggleOne(id: string) { setSelectedIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function resetChanges() { setCostDrafts({ ...costOriginals }); setMarginDrafts({ ...marginOriginals }); setError(null); setSuccess(null); }

  async function hydrateSelectedCosts(ids: string[]) {
    const { data, error: rpcError } = await supabase.rpc("get_product_costs_for_products", { p_product_ids: ids, p_currency_code: "USD" }); if (rpcError) throw rpcError;
    const originals = { ...costOriginals }; const drafts = { ...costDrafts };
    for (const id of ids) if (!(id in originals)) { originals[id] = ""; drafts[id] = ""; }
    for (const row of (data ?? []) as { product_id: string; amount: string | number }[]) if (!(row.product_id in costOriginals)) { originals[row.product_id] = toInput(row.amount); drafts[row.product_id] = toInput(row.amount); }
    setCostOriginals(originals); setCostDrafts(drafts); return drafts;
  }
  async function applyBulkCost() {
    setError(null); setSuccess(null); const ids = [...selectedIds]; if (!ids.length) { setError("Select at least one product."); return; }
    const adjustment = parse(bulkValue); if (adjustment === null) { setError("Enter a valid adjustment value."); return; }
    try { const hydrated = await hydrateSelectedCosts(ids); const next = { ...hydrated }; let applied = 0, skipped = 0;
      for (const id of ids) { const current = parse(next[id]); let result: number | null = null; if (bulkMode === "set_amount") result = adjustment; if (bulkMode === "current_percent" && current !== null) result = current * (1 + adjustment / 100); if (bulkMode === "current_amount" && current !== null) result = current + adjustment; if (result === null || !Number.isFinite(result) || result < 0) { skipped += 1; continue; } next[id] = result.toFixed(2); applied += 1; }
      setCostDrafts(next); setSuccess(skipped ? `Bulk cost preview applied to ${applied} products; ${skipped} skipped.` : `Bulk cost preview applied to ${applied} products. Review and save.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load selected costs."); }
  }

  async function saveChanges() {
    setError(null); setSuccess(null); const costPayload: { product_id: string; amount: number | null }[] = [];
    for (const id of costDirtyIds) { const raw = costDrafts[id] ?? ""; const value = parse(raw); if (raw.trim() && (value === null || value < 0)) { setError("One or more costs are invalid."); return; } costPayload.push({ product_id: id, amount: value }); }
    for (const id of marginDirtyIds) { const raw = marginDrafts[id] ?? ""; const value = parse(raw); if (raw.trim() && (value === null || value < 0 || value > 100)) { setError("Minimum margin must be between 0 and 100."); return; } }
    if (!dirtyCount) return; setIsSaving(true);
    if (costPayload.length) { const { error: rpcError } = await supabase.rpc("set_product_costs_bulk", { p_changes: costPayload, p_currency_code: "USD" }); if (rpcError) { setError(rpcError.message); setIsSaving(false); return; } }
    for (const id of marginDirtyIds) { const raw = marginDrafts[id] ?? ""; if (!raw.trim()) { const { error: deleteError } = await supabase.from("product_margin_settings").delete().eq("product_id", id); if (deleteError) { setError(deleteError.message); setIsSaving(false); return; } } else { const { error: upsertError } = await supabase.from("product_margin_settings").upsert({ product_id: id, min_margin_percent: parse(raw) }, { onConflict: "product_id" }); if (upsertError) { setError(upsertError.message); setIsSaving(false); return; } } }
    const saved = dirtyCount; setIsSaving(false); setSuccess(`${saved} change${saved === 1 ? "" : "s"} saved successfully.`); await load();
  }
  async function saveSettings() {
    setError(null); setSuccess(null); const min = parse(defaultMin); const buffer = parse(warningBuffer); if (min === null || min < 0 || min > 100 || buffer === null || buffer < 0 || buffer > 100) { setError("Margin settings must be between 0 and 100."); return; }
    setIsSavingSettings(true); const { error: updateError } = await supabase.from("pricing_settings").update({ default_min_margin_percent: min, warning_margin_buffer_percent: buffer }).eq("id", 1); if (updateError) { setError(updateError.message); setIsSavingSettings(false); return; }
    setOriginalDefaultMin(toInput(min)); setOriginalWarningBuffer(toInput(buffer)); setIsSavingSettings(false); setSuccess("Margin settings saved successfully.");
  }

  if (hasAccess === false) return <div className="rounded-2xl border border-error-200 bg-error-50 p-8 text-center dark:border-error-500/30 dark:bg-error-500/10"><h3 className="text-lg font-semibold text-error-700 dark:text-error-400">Access Denied</h3><p className="mt-2 text-sm text-error-600 dark:text-error-400">Cost and margin information is available only to admins.</p></div>;
  if (hasAccess === null) return <Loading label="Checking access..." />;

  const start = totalCount ? (page - 1) * pageSize + 1 : 0; const end = Math.min(page * pageSize, totalCount);
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, Math.min(totalPages - 4, page - 2)) + index).filter((value) => value <= totalPages);
  const defaultMinNumber = parse(defaultMin) ?? 20; const bufferNumber = parse(warningBuffer) ?? 5;

  return <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Cost & Margin</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Paged cost and margin analysis; only current-page pricing data is loaded.</p></div><div className="flex gap-2"><button className={buttonClass} onClick={resetChanges} disabled={!dirtyCount || isSaving}>Reset</button><button className={primaryButtonClass} onClick={saveChanges} disabled={!dirtyCount || isSaving}>{isSaving ? "Saving..." : `Save Changes${dirtyCount ? ` (${dirtyCount})` : ""}`}</button></div></div></div>
    <div className="p-5 sm:p-6">
      {error && <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{error}</div>}{success && <div className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">{success}</div>}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5"><Summary title="Products" value={summary.total_products} /><Summary title="With Cost" value={summary.products_with_cost} /><Summary title="Missing Cost" value={summary.missing_cost} /><Summary title="Below Margin" value={summary.below_margin} /><Summary title="Healthy" value={summary.healthy} /></div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Margin Settings</div><div className="grid gap-3 md:grid-cols-3"><input value={defaultMin} onChange={(e) => setDefaultMin(e.target.value)} className={inputClass} placeholder="Default minimum margin %" /><input value={warningBuffer} onChange={(e) => setWarningBuffer(e.target.value)} className={inputClass} placeholder="Warning buffer %" /><button className={primaryButtonClass} onClick={saveSettings} disabled={!settingsDirty || isSavingSettings}>{isSavingSettings ? "Saving..." : "Save Margin Settings"}</button></div></div>

      <form onSubmit={submitSearch} className="mb-4 grid gap-3 lg:grid-cols-9"><input value={queryInput} onChange={(e) => setQueryInput(e.target.value)} placeholder="SKU, barcode, product, brand..." className={`${inputClass} lg:col-span-2`} disabled={dirtyCount > 0} /><select value={statusFilter} onChange={(e) => navigate(() => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); })} className={inputClass} disabled={dirtyCount > 0}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select value={brandFilter} onChange={(e) => navigate(() => { setBrandFilter(e.target.value); setPage(1); })} className={inputClass} disabled={dirtyCount > 0}><option value="">All Brands</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={categoryFilter} onChange={(e) => navigate(() => { setCategoryFilter(e.target.value); setPage(1); })} className={inputClass} disabled={dirtyCount > 0}><option value="">All Categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={stockFilter} onChange={(e) => navigate(() => { setStockFilter(e.target.value as StockFilter); setPage(1); })} className={inputClass} disabled={dirtyCount > 0}><option value="all">All Stock</option><option value="in_stock">In Stock</option><option value="out_of_stock">Out of Stock</option></select><select value={marginFilter} onChange={(e) => navigate(() => { setMarginFilter(e.target.value as MarginFilter); setPage(1); })} className={inputClass} disabled={dirtyCount > 0}><option value="all">All Margins</option><option value="healthy">Healthy</option><option value="warning">Warning</option><option value="critical">Critical</option><option value="loss">Loss</option><option value="missing_cost">Missing Cost</option><option value="no_price">No Price</option></select><button className={primaryButtonClass} disabled={dirtyCount > 0}>Search</button><button type="button" className={buttonClass} onClick={clearFilters} disabled={dirtyCount > 0 || !activeFilters}>Clear{activeFilters ? ` (${activeFilters})` : ""}</button></form>

      <div className="mb-4 flex flex-wrap items-center gap-3"><select value={sortBy} onChange={(e) => navigate(() => { setSortBy(e.target.value as SortBy); setPage(1); })} className={`${inputClass} w-auto`} disabled={dirtyCount > 0}>{["sku","name","brand","category","stock","status","cost","margin"].map((value) => <option key={value} value={value}>Sort: {value}</option>)}</select><select value={sortDirection} onChange={(e) => navigate(() => { setSortDirection(e.target.value as SortDirection); setPage(1); })} className={`${inputClass} w-auto`} disabled={dirtyCount > 0}><option value="asc">Ascending</option><option value="desc">Descending</option></select><select value={pageSize} onChange={(e) => navigate(() => { setPageSize(Number(e.target.value)); setPage(1); })} className={`${inputClass} w-auto`} disabled={dirtyCount > 0}>{pageSizes.map((value) => <option key={value} value={value}>{value} / page</option>)}</select><span className="text-sm text-gray-500 dark:text-gray-400">Showing {start}–{end} of {totalCount}</span></div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><div className="mb-3 flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-800 dark:text-white/90">Bulk Cost</strong><span className="text-xs text-gray-500 dark:text-gray-400">{selectedIds.size} selected</span><button className={buttonClass} onClick={() => setSelectedIds(new Set(filteredIds))} disabled={!filteredIds.length}>Select all filtered ({filteredIds.length})</button><button className={buttonClass} onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}>Clear selection</button></div><div className="grid gap-3 md:grid-cols-3"><select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as BulkMode)} className={inputClass}><option value="current_percent">Adjust current %</option><option value="current_amount">Adjust current $</option><option value="set_amount">Set exact cost</option></select><input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Adjustment" className={inputClass} /><button className={primaryButtonClass} onClick={applyBulkCost} disabled={!selectedIds.size || !bulkValue.trim()}>Apply Preview</button></div></div>

      {isLoading ? <Loading label="Loading cost & margin..." /> : <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-800"><table className="min-w-max divide-y divide-gray-200 dark:divide-gray-800"><thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="px-3 py-3"><input type="checkbox" checked={allPageSelected} onChange={togglePage} /></th><th className="px-4 py-3 text-left text-xs uppercase text-gray-500">SKU</th><th className="min-w-[240px] px-4 py-3 text-left text-xs uppercase text-gray-500">Product</th><th className="px-4 py-3 text-right text-xs uppercase text-gray-500">Stock</th><th className="min-w-[130px] px-4 py-3 text-left text-xs uppercase text-gray-500">Cost</th><th className="min-w-[130px] px-4 py-3 text-left text-xs uppercase text-gray-500">Min Margin %</th><th className="px-4 py-3 text-left text-xs uppercase text-gray-500">Health</th>{groups.map((group) => <th key={group.id} className="min-w-[160px] px-4 py-3 text-left text-xs uppercase text-gray-500">{group.name}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.length ? rows.map((row) => { const costValue = parse(costDrafts[row.product_id]); const minValue = parse(marginDrafts[row.product_id]) ?? defaultMinNumber; const margins = groups.map((group) => margin(row.prices?.[group.id] === undefined ? null : Number(row.prices[group.id]), costValue)); const rowHealth = health(margins, costValue, minValue, bufferNumber); return <tr key={row.product_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"><td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(row.product_id)} onChange={() => toggleOne(row.product_id)} /></td><td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{row.sku}</td><td className="px-4 py-3"><div className="text-sm text-gray-800 dark:text-white/90">{row.product_name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{[row.brand,row.category].filter(Boolean).join(" • ") || "—"}</div></td><td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{stock(row.available_stock)}</td><td className="px-4 py-3"><input value={costDrafts[row.product_id] ?? ""} onChange={(e) => setCostDrafts((current) => ({ ...current, [row.product_id]: e.target.value }))} className={`${inputClass} w-28 ${normalize(costDrafts[row.product_id]) !== normalize(costOriginals[row.product_id]) ? "border-brand-400 ring-2 ring-brand-500/10" : ""}`} /></td><td className="px-4 py-3"><input value={marginDrafts[row.product_id] ?? ""} onChange={(e) => setMarginDrafts((current) => ({ ...current, [row.product_id]: e.target.value }))} placeholder={String(defaultMinNumber)} className={`${inputClass} w-28 ${normalize(marginDrafts[row.product_id]) !== normalize(marginOriginals[row.product_id]) ? "border-brand-400 ring-2 ring-brand-500/10" : ""}`} /></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthClass(rowHealth)}`}>{rowHealth.replace("_", " ")}</span></td>{groups.map((group) => { const price = row.prices?.[group.id] === undefined ? null : Number(row.prices[group.id]); const m = margin(price, costValue); return <td key={group.id} className="px-4 py-3"><div className="text-sm font-medium text-gray-700 dark:text-gray-300">{money(price)}</div><div className={`text-xs ${m !== null && m < minValue ? "text-error-500" : "text-gray-500 dark:text-gray-400"}`}>{m === null ? "—" : `${m.toFixed(1)}%`}</div></td>; })}</tr>; }) : <tr><td colSpan={7 + groups.length} className="px-6 py-14 text-center text-sm text-gray-500 dark:text-gray-400">No products found.</td></tr>}</tbody></table></div>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span><div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={page <= 1 || isLoading || dirtyCount > 0} onClick={() => navigate(() => setPage((value) => Math.max(1, value - 1)))}>Previous</button>{visiblePages.map((value) => <button key={value} className={value === page ? primaryButtonClass : buttonClass} disabled={dirtyCount > 0} onClick={() => navigate(() => setPage(value))}>{value}</button>)}<button className={buttonClass} disabled={page >= totalPages || isLoading || dirtyCount > 0} onClick={() => navigate(() => setPage((value) => Math.min(totalPages, value + 1)))}>Next</button></div></div>
    </div>
  </div>;
}

function Summary({ title, value }: { title: string; value: number }) { return <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{title}</div><div className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{value.toLocaleString()}</div></div>; }
function Loading({ label }: { label: string }) { return <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" /><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p></div></div>; }
