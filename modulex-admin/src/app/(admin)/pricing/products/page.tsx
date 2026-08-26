import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProductPricesServerTable from "@/components/pricing/ProductPricesServerTable";

export const metadata: Metadata = {
  title:
    "Product Prices | Modulex Admin",
  description:
    "Manage Modulex product prices and customer price groups",
};

export default function ProductPricesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Product Prices" />

      <ProductPricesServerTable />
    </div>
  );
}
