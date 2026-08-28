import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreLeadsTable from "@/components/store/StoreLeadsTable";

export const metadata: Metadata = {
  title: "Store Leads | Modulex Admin",
  description: "Review website inquiries and dealer applications",
};

export default function StoreLeadsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Leads & Dealer Applications" />
      <StoreLeadsTable />
    </div>
  );
}
