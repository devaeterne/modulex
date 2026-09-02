"use client";

import { useMemo, useState } from "react";
import FormHint from "@/components/form/FormHint";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { pricingModelLabel } from "@/lib/customers/order-domain";
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

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number.isFinite(value) ? value : 0);
}

export default function OrderProductPicker({
  isOpen,
  onClose,
  products,
  selectedQuantities,
  priceMap,
  onAdd,
  currencyCode = "USD",
  disableWithoutPrice = false,
  excludedProductTypeCodes = [],
}: OrderProductPickerProps) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const excludedCodes = useMemo(() => new Set(excludedProductTypeCodes.map((code) => code.toUpperCase())), [excludedProductTypeCodes]);
  const eligibleProducts = useMemo(
    () => products.filter((product) => !excludedCodes.has(product.product_type_code.toUpperCase())),
    [excludedCodes, products],
  );

  const brands = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of eligibleProducts) {
      if (product.brand_id && product.brand) values.set(product.brand_id, product.brand);
    }
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [eligibleProducts]);

  const categories = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of eligibleProducts) {
      if (product.category_id && product.category) values.set(product.category_id, product.category);
    }
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [eligibleProducts]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return eligibleProducts.filter((product) => {
      if (brandFilter && product.brand_id !== brandFilter) return false;
      if (categoryFilter && product.category_id !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      return [product.sku, product.name, product.barcode, product.brand, product.category]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [eligibleProducts, query, brandFilter, categoryFilter]);

  const activeFilterCount = [query.trim(), brandFilter, categoryFilter].filter(Boolean).length;
  const totalSelectedQuantity = Array.from(selectedQuantities.values()).reduce((sum, selected) => sum + selected, 0);

  function clearFilters() {
    setQuery("");
    setBrandFilter("");
    setCategoryFilter("");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-h-[90vh] w-full max-w-6xl overflow-hidden" ariaLabel="Cabinet products">
      <div className="flex max-h-[90vh] flex-col">
        <div className="space-y-4 p-5 pr-16 sm:p-6 sm:pr-16">
          <div>
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Cabinet Products</h3>
            <FormHint>Search eligible Price Group products and add them to the order.</FormHint>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search SKU, product, barcode, brand..."
              ariaLabel="Search Cabinet products"
            />
            <Select
              value={brandFilter}
              allowEmpty
              placeholder="All Brands"
              options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
              onChange={setBrandFilter}
              ariaLabel="Filter by brand"
            />
            <Select
              value={categoryFilter}
              allowEmpty
              placeholder="All Categories"
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              onChange={setCategoryFilter}
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
              {filteredProducts.length === 0 ? (
                <TableStateRow colSpan={7}>No eligible Cabinet products found for the selected filters.</TableStateRow>
              ) : filteredProducts.map((product) => {
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
          <FormHint>{filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} shown · {totalSelectedQuantity} item{totalSelectedQuantity === 1 ? "" : "s"} in order</FormHint>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}