import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import WarehouseForm from "@/components/warehouses/WarehouseForm";
import { Metadata } from "next";

type EditWarehousePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Warehouse | Modulex Admin",
  description: "Edit warehouse in Modulex Admin",
};

export default async function EditWarehousePage({
  params,
}: EditWarehousePageProps) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Warehouse" />
      <WarehouseForm mode="edit" warehouseId={id} />
    </div>
  );
}