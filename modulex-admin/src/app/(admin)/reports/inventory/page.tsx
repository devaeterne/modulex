import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import InventoryReport from "@/components/reports/InventoryReport";

export const metadata: Metadata = {
  title: "Inventory Reports | Modulex Admin",
  description: "Inventory product and location reporting",
};

export default function InventoryReportsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Inventory Reports" />
      <InventoryReport />
    </div>
  );
}
