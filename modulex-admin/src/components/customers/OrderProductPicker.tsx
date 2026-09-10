"use client";

import { useEffect, useMemo, useState } from "react";
import FormHint from "@/components/form/FormHint";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { pricingModelLabel, searchOrderCabinetProducts } from "@/lib/customers/order-domain";
import type { OrderPricingModel } from "@/lib/customers/types";

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
  product_type_code: string;
  product_type_name: string;
  pricing_model: OrderPricingModel;
  uom_code: string;
  uom_name: string;
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
  excludedProductTypeCodes?: string[];
};

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number.isFinite(value) ? value : 0);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Unable to search Cabinet products.";
}

export default function OrderProductPicker(props: OrderProductPickerProps) {
  const {
    isOpen,
    onClose,
    products,
    selectedQuantities,
    priceMap,
    onAdd,
    currencyCode = "USD",
    disableWithoutPrice = false,
  } = props;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [serverProducts, setServerProducts] = useState<OrderPickerProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const cabinetProductsForFacets = useMemo(
    () => products.filter((product) => product.status === "active" && product.product_type_code.toUpperCase() === "CABINETS"),
    [products],
  );

  const brands = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of cabinetProductsForFacets) {
      if (product.brand_id && product.brand) values.set(product.brand_id, product.brand);
    }
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cabinetProductsForFacets]);

  const categories = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of cabinetProductsForFacets) {
      if (product.category_id && product.category) values.set(product.category_id, product.category);
    }
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cabinetProductsForFacets]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function load() {
      setIsSearching(true);
      setSearchError(null);
      try {
        const result = await searchOrderCabinetProducts({
          query: debouncedQuery,
          brandId: brandFilter || undefined,
          categoryId: categoryFilter || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!active) return;
        setServerProducts(result.products as OrderPickerProduct[]);
        setTotalCount(result.totalCount);
      } catch (error) {
        if (!active) return;
        setServerProducts([]);
        setTotalCount(0);
        setSearchError(errorMessage(error));
      } finally {
        if (active) setIsSearching(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [isOpen, debouncedQuery, brandFilter, categoryFilter, page]);

  const activeFilterCount = [query.trim(), brandFilter, categoryFilter].filter(Boolean).length;
  const totalSelectedQuantity = Array.from(selectedQuantities.values()).reduce((sum, selected) => sum + selected, 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstResult = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, totalCount);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleBrandChange(value: string) {
    setBrandFilter(value);
    setPage(1);
  }

  function handleCategoryChange(value: string) {
    setCategoryFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setBrandFilter("");
    setCategoryFilter("");
    setPage(1);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-h-[90vh] w-full max-w-6xl overflow-hidden" ariaLabel="Cabinet products">
      <div className="flex max-h-[90vh] flex-col">
        <div className="space-y-4 p-5 pr-16 sm:p-6 sm:pr-16">
          <div>
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Cabinet Products</h3>
            <FormHint>Active CABINETS are searched on the server. Results are paginated in batches of {PAGE_SIZE}.</FormHint>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
            <Input
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              type="search"
              placeholder="Search SKU, product, barcode, brand..."
              ariaLabel="Search Cabinet products"
            />
            <Select
              value={brandFilter}
              allowEmpty
              placeholder="All Brands"
              options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
              onChange={handleBrandChange}
              ariaLabel="Filter by brand"
            />
            <Select
              value={categoryFilter}
              allowEmpty
              placeholder="All Categories"
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              onChange={handleCategoryChange}
              ariaLabel="Filter by category"
            />
            <Button variant="outline" disabled={activeFilterCount === 0} onClick={clearFilters}>
              Clear{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>
        </div>

        <TableViewport className="min-h-0 flex-1">
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                {["SKU", "Product", "Type / UOM", "Pricing Route", "Price", "In Order", ""].map((label) => (
                  <TableCell key={label} isHeader variant="admin">{label}</TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {isSearching ? (
                <TableStateRow colSpan={7}>Searching Cabinet products…</TableStateRow>
              ) : searchError ? (
                <TableStateRow colSpan={7}>{searchError}</TableStateRow>
              ) : serverProducts.length === 0 ? (
                <TableStateRow colSpan={7}>No active Cabinet products found for the selected filters.</TableStateRow>
              ) : serverProducts.map((product) => {
                const selectedQuantity = selectedQuantities.get(product.id) ?? 0;
                const hasPrice = priceMap.has(product.id);
                const isDisabled = product.pricing_model !== "price_group" || (disableWithoutPrice && !hasPrice);
                return (
                  <TableRow key={product.id}>
                    <TableCell variant="admin" className="font-semibold">{product.sku}</TableCell>
                    <TableCell variant="admin" className="min-w-[240px]">{product.name}</TableCell>
                    <TableCell variant="admin">{product.product_type_name} · {product.uom_name} ({product.uom_code})</TableCell>
                    <TableCell variant="admin">
                      <Badge size="sm" color={product.pricing_model === "price_group" ? "success" : "warning"}>{pricingModelLabel(product.pricing_model)}</Badge>
                    </TableCell>
                    <TableCell variant="admin">{hasPrice ? money(priceMap.get(product.id) ?? 0, currencyCode) : "No price"}</TableCell>
                    <TableCell variant="admin">{selectedQuantity > 0 ? selectedQuantity : "—"}</TableCell>
                    <TableCell variant="admin" className="text-right">
                      <Button size="sm" disabled={isDisabled} onClick={() => onAdd(product)}>{selectedQuantity > 0 ? "Add one" : "Select"}</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <FormHint>
            {totalCount === 0 ? "0 products" : `${firstResult}–${lastResult} of ${totalCount} products`} · {totalSelectedQuantity} item{totalSelectedQuantity === 1 ? "" : "s"} in order
          </FormHint>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={isSearching || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <FormHint>Page {Math.min(page, totalPages)} of {totalPages}</FormHint>
            <Button size="sm" variant="outline" disabled={isSearching || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
