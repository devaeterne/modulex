import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import WarehousesTable from "@/components/warehouses/WarehousesTable";

export const metadata: Metadata = {
  title: "Warehouses | Modulex Admin",
  description: "Manage Modulex warehouses",
};

export default function WarehousesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Warehouses" />
      <WarehousesTable />
    </div>
  );
}