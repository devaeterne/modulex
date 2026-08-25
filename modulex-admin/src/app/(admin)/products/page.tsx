import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProductsTable from "@/components/products/ProductsTable";

export const metadata: Metadata = {
  title: "Products | Modulex Admin",
  description: "Manage Modulex products, SKU, barcode and stock metadata",
};

export default function ProductsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Products" />
      <ProductsTable />
    </div>
  );
}