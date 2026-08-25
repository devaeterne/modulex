import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import WarehouseForm from "@/components/warehouses/WarehouseForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Warehouse | Modulex Admin",
  description: "Create a warehouse in Modulex Admin",
};

export default function NewWarehousePage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Create Warehouse" />
      <WarehouseForm mode="create" />
    </div>
  );
}