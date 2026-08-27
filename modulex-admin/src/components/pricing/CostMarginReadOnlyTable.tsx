"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Row = {
  product_id: string;
  sku: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  available_stock: string | number;
  cost_amount: string | number | null;
  effective_min_margin: string | number;
  margin_health: string;
  worst_margin: string | number | null;
};

type Payload = {
  items: Row[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    total_products: number;
    products_with_cost: number;
    missing_cost: number;
    below_margin: number;
    healthy: number;
  };
};

const pageSizes = [25, 50, 100];

function money(value: string | number | null | undefined) {
  const amount = Number(value);
  if (value === null || value === undefined || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function percent(value: string | number | null | undefined) {
  const amount = Number(value);
  return value === null || value === undefined || !Number.isFinite(amount) ? "—" : `${amount.toFixed(2)}%`;
}

function healthClass(value: string) {
  if (value === "healthy") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (value === "warning") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  if (value === "critical" || value === "loss") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CostMarginReadOnlyTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Payload["summary"]>({ total_products: 0, products_with_cost: 0, missing_cost: 0, below_margin: 0, healthy: 0 });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("get_cost_margin_page", {
      p_query: query,
      p_page: page,
      p_page_size: pageSize,
      p_status: null,
      p_brand_id: null,
      p_category_id: null,
      p_stock_filter: null,
      p_margin_filter: null,
      p_sort_by: "sku",
      p_sort_direction: "asc",
      p_currency_code: "USD",
    });
    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }
    const payload = data as Payload;
    setRows(payload.items ?? []);
    setSummary(payload.summary ?? { total_products: 0, products_with_cost: 0, missing_cost: 0, below_margin: 0, healthy: 0 });
    setTotalCount(payload.total_count ?? 0);
    setTotalPages(payload.total_pages ?? 1);
    setIsLoading(false);
  }, [query, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
        Read-only financial view. Cost and margin changes require Pricing Management permission.
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Products" value={summary.total_products} />
        <Metric label="With Cost" value={summary.products_with_cost} />
        <Metric label="Missing Cost" value={summary.missing_cost} />
        <Metric label="Below Margin" value={summary.below_margin} />
        <Metric label="Healthy" value={summary.healthy} />
      </div>

      {error && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <form onSubmit={submitSearch} className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row dark:border-gray-800">
          <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search SKU or product..." className="h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          <button type="submit" className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white">Search</button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]"><tr>{["SKU", "Product", "Brand", "Category", "Stock", "Cost", "Min Margin", "Worst Margin", "Health"].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">Loading cost & margin...</td></tr> : rows.map((row) => (
                <tr key={row.product_id}>
                  <td className="px-4 py-4 text-sm font-semibold text-gray-800 dark:text-white/90">{row.sku}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">{row.product_name}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{row.brand || "—"}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{row.category || "—"}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{Number(row.available_stock ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-800 dark:text-gray-200">{money(row.cost_amount)}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{percent(row.effective_min_margin)}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{percent(row.worst_margin)}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthClass(row.margin_health)}`}>{titleCase(row.margin_health)}</span></td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">No products found.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <p className="text-sm text-gray-500">{totalCount} products</p>
          <div className="flex items-center gap-2">
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{pageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-9 rounded-lg border border-gray-300 px-3 text-xs disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Previous</button>
            <span className="min-w-[70px] text-center text-xs text-gray-500">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="h-9 rounded-lg border border-gray-300 px-3 text-xs disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>;
}
