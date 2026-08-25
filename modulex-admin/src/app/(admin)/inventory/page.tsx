import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import InventoryTable from "@/components/inventory/InventoryTable";

export const metadata: Metadata = {
  title: "Inventory | Modulex Admin",
  description: "Modulex inventory and stock overview",
};

export default function InventoryPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Inventory" />
      <InventoryTable />
    </div>
  );
}