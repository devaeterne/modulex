import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreProductsTable from "@/components/store/StoreProductsTable";

export const metadata: Metadata = {
  title: "Store Products | Modulex Admin",
  description: "Manage Oakwell Store product content and publication status",
};

export default function StoreProductsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Product Content" />
      <StoreProductsTable />
    </div>
  );
}
