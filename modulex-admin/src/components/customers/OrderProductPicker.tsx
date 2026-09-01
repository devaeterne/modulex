"use client";

import { useEffect, useMemo, useState } from "react";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableViewport } from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

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
};

type PricingModel = "price_group" | "countertop_material_band" | "none" | string;
type ProductSemantics = {
  productTypeName: string;
  uomName: string;
  pricingModel: PricingModel;
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

function relationOne(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pricingLabel(model: PricingModel | undefined) {
  if (model === "price_group") return "Price Group";
  if (model === "countertop_material_band") return "Countertop Material Band";
  if (model === "none") return "No Commercial Pricing";
  return "Unavailable";
}

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(Number.isFinite(value) ? value : 0);
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
}: OrderProductPickerProps) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [semantics, setSemantics] = useState<Map<string, ProductSemantics>>(new Map());

  useEffect(() => {
    if (!isOpen || products.length === 0) return;
    let cancelled = false;

    void supabase
      .from("products")
      .select("id, product_type:product_types!inner(name, pricing_model), uom:units_of_measure!inner(name)")
      .in("id", products.map((product) => product.id))
      .then(({ data }) => {
        if (cancelled) return;
        const next = new Map<string, ProductSemantics>();
        for (const row of data ?? []) {
          const productType = relationOne(row.product_type);
          const uom = relationOne(row.uom);
          next.set(String(row.id), {
            productTypeName: String(productType?.name ?? "Unknown"),
            uomName: String(uom?.name ?? "Unknown"),
            pricingModel: String(productType?.pricing_model ?? "unknown"),
          });
        }
        setSemantics(next);
      });

    return () => { cancelled = true; };
  }, [isOpen, products]);

  const brands = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of products) if (product.brand_id && product.brand) values.set(product.brand_id, product.brand);
    return Array.from(values, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const categories = useMemo(() => {
    const values = new Map<string, string>();
    for (const product of products) if (product.category_id && product.category) values.set(product.category_id, product.category);
    return Array.from(values, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (brandFilter && product.brand_id !== brandFilter) return false;
      if (categoryFilter && product.category_id !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      const semantic = semantics.get(product.id);
      return [product.sku, product.name, product.barcode, product.brand, product.category, semantic?.productTypeName, semantic?.uomName, pricingLabel(semantic?.pricingModel)]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [products, query, brandFilter, categoryFilter, semantics]);

  const totalSelectedQuantity = Array.from(selectedQuantities.values()).reduce((sum, quantity) => sum + quantity, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-h-[90vh] max-w-7xl overflow-hidden">
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-b border-gray-200 px-5 py-5 pr-16 dark:border-gray-800 sm:px-6">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">Add Products</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Product Type selects the commercial pricing route. UOM describes quantity/measure only.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_220px_auto]">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search product, SKU, Product Type, UOM..." />
            <Select value={brandFilter} onChange={setBrandFilter} options={brands} placeholder="All Brands" allowEmpty />
            <Select value={categoryFilter} onChange={setCategoryFilter} options={categories} placeholder="All Categories" allowEmpty />
            <Button variant="outline" onClick={() => { setQuery(""); setBrandFilter(""); setCategoryFilter(""); }} disabled={!query && !brandFilter && !categoryFilter}>Clear</Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
          <TableViewport>
            <Table variant="admin">
              <TableHeader variant="admin">
                <TableRow>
                  {["SKU", "Product", "Product Type", "UOM", "Pricing Route", "Price", "In Order", ""].map((label) => (
                    <TableCell key={label} isHeader variant="admin" className="whitespace-nowrap text-left">{label}</TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {filteredProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={8} variant="admin" className="py-10 text-center">No products found.</TableCell></TableRow>
                ) : filteredProducts.map((product) => {
                  const semantic = semantics.get(product.id);
                  const selectedQuantity = selectedQuantities.get(product.id) ?? 0;
                  const hasPrice = priceMap.has(product.id);
                  const route = semantic?.pricingModel;
                  const supported = route === "price_group";
                  const isDisabled = !semantic || !supported || (disableWithoutPrice && !hasPrice);
                  const reason = route === "countertop_material_band"
                    ? "Configure Stone through the canonical Countertop workspace."
                    : route === "none"
                      ? "This Product Type has No Commercial Pricing."
                      : !semantic
                        ? "Product pricing semantics are unavailable."
                        : !hasPrice
                          ? "This product has no current Price Group price."
                          : undefined;

                  return (
                    <TableRow key={product.id} title={reason}>
                      <TableCell variant="admin" className="whitespace-nowrap font-semibold">{product.sku}</TableCell>
                      <TableCell variant="admin" className="min-w-[220px]">{product.name}</TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap">{semantic?.productTypeName ?? "—"}</TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap">{semantic?.uomName ?? "—"}</TableCell>
                      <TableCell variant="admin" className="min-w-[190px]">
                        <div className="space-y-1">
                          <Badge size="sm" color={route === "price_group" ? "success" : route === "countertop_material_band" ? "warning" : "light"}>{pricingLabel(route)}</Badge>
                          {reason ? <p className="text-xs text-gray-500 dark:text-gray-400">{reason}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap font-medium">{route === "price_group" && hasPrice ? money(priceMap.get(product.id) ?? 0, currencyCode) : "—"}</TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap">{selectedQuantity > 0 ? <Badge size="sm">{selectedQuantity}</Badge> : "—"}</TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap text-right">
                        <Button size="sm" disabled={isDisabled} onClick={() => onAdd(product)}>{selectedQuantity > 0 ? "Add +1" : "Add"}</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableViewport>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">{filteredProducts.length} products shown • {totalSelectedQuantity} item(s) in order</p>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
