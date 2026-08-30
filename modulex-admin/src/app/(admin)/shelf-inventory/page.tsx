import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import InventoryTable from "@/components/inventory/InventoryTable";

export const metadata: Metadata = {
  title: "Shelf Inventory | Modulex Admin",
  description: "Review Modulex inventory by warehouse, zone, and shelf location",
};

export default function ShelfInventoryPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Shelf Inventory" />
      <InventoryTable mode="shelf" />
    </div>
  );
}
