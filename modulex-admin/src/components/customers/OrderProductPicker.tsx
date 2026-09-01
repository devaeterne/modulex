"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";

export type OrderPickerProduct = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  status: string;
  brand: string | null;
  category: string | null;
  brand_id: string | null;
  category_id: string | null;
  product_type_id: string;
  product_type_name: string;
  pricing_model: "price_group" | "countertop_material_band" | "none";
  uom_id: string;
  uom_code: string;
  pricing_route_reason: string | null;
};

type OrderProductPickerProps = {
  isOpen: boolean;
  onClose: () => void;
  products: OrderPickerProduct[];
  selectedQuantities: Map<string, number>;
  priceMap: Map<string, number>;
  onAdd: (product: OrderPickerProduct) => void;
  currencyCode?: string;
  disableWithoutPrice?: boolean;
};

const controlClass =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300";

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(Number.isFinite(value) ? value : 0);
}

function pricingLabel(product: OrderPickerProduct) {
  if (product.pricing_model === "price_group") return "Price Group";
  if (product.pricing_model === "countertop_material_band") return "Countertop";
  return "No commercial price";
}

export default function OrderProductPicker({ isOpen, onClose, products, selectedQuantities, priceMap, onAdd, currencyCode = "USD", disableWithoutPrice = false }: OrderProductPickerProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const brands = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of products) if (product.brand_id && product.brand) values.set(product.brand_id, product.brand);
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);
  const categories = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of products) if (product.category_id && product.category) values.set(product.category_id, product.category);
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (brandFilter && product.brand_id !== brandFilter) return false;
      if (categoryFilter && product.category_id !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      return [product.sku, product.name, product.barcode, product.brand, product.category, product.product_type_name, product.uom_code, pricingLabel(product)]
        .filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [products, query, brandFilter, categoryFilter]);

  const activeFilterCount = [query.trim(), brandFilter, categoryFilter].filter(Boolean).length;
  const totalSelectedQuantity = Array.from(selectedQuantities.values()).reduce((sum, quantity) => sum + quantity, 0);
  function clearFilters() { setQuery(""); setBrandFilter(""); setCategoryFilter(""); searchRef.current?.focus(); }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-h-[90vh] max-w-6xl overflow-hidden">
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-b border-gray-200 px-5 py-5 pr-16 dark:border-gray-800 sm:px-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">Add Products</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Product Type selects the pricing route. UOM only describes quantity semantics.</p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
            <div className="relative">
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search SKU, product, type, UOM..." className={`${controlClass} pr-10`} />
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </div>
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className={controlClass}><option value="">All Brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={controlClass}><option value="">All Categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <Button variant="outline" size="sm" onClick={clearFilters} disabled={activeFilterCount === 0}>Clear{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900"><tr>{["SKU", "Product", "Product Type", "UOM", "Pricing route", "Price", "In Order", ""].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredProducts.length === 0 ? <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No products found for the selected filters.</td></tr> : filteredProducts.map((product) => {
                const selectedQuantity = selectedQuantities.get(product.id) ?? 0;
                const hasPrice = priceMap.has(product.id);
                const routeBlocked = product.pricing_model !== "price_group";
                const isDisabled = routeBlocked || (disableWithoutPrice && !hasPrice);
                const reason = product.pricing_route_reason ?? (!hasPrice ? "No current Price Group price is available." : null);
                return <tr key={product.id} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">{product.sku}</td>
                  <td className="min-w-[220px] px-4 py-3 text-sm text-gray-700 dark:text-gray-300"><div>{product.name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{product.brand || "—"} · {product.category || "—"}</div></td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{product.product_type_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{product.uom_code}</td>
                  <td className="min-w-[180px] px-4 py-3 text-sm text-gray-600 dark:text-gray-300"><div>{pricingLabel(product)}</div>{reason && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{reason}</div>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{hasPrice ? money(priceMap.get(product.id) ?? 0, currencyCode) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{selectedQuantity > 0 ? selectedQuantity : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right"><Button size="sm" disabled={isDisabled} onClick={() => onAdd(product)}>{selectedQuantity > 0 ? "Add +1" : "Add"}</Button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-sm text-gray-500 dark:text-gray-400">{filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} shown • {totalSelectedQuantity} item{totalSelectedQuantity === 1 ? "" : "s"} in order</p><Button onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}
