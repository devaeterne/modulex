import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PriceGroupsTable from "@/components/pricing/PriceGroupsTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Price Groups | Modulex Admin",
  description: "Manage price groups in Modulex Admin",
};

export default function PriceGroupsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Price Groups" />
      <PriceGroupsTable />
    </div>
  );
}