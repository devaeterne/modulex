import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopCatalogManager from "@/components/countertop/CountertopCatalogManager";

export const metadata: Metadata = {
  title: "Countertop Catalog | Modulex Admin",
  description: "Manage Stone and Sink products and Countertop pricing references",
};

export default function CountertopCatalogPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Countertop Catalog" />
      <CountertopCatalogManager />
    </div>
  );
}
