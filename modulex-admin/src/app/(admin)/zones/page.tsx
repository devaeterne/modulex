import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ZonesTable from "@/components/zones/ZonesTable";

type ZonesPageProps = {
  searchParams: Promise<{
    warehouse?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Zones | Modulex Admin",
  description: "Manage Modulex warehouse zones",
};

export default async function ZonesPage({
  searchParams,
}: ZonesPageProps) {
  const params = await searchParams;

  const warehouseId =
    typeof params.warehouse === "string"
      ? params.warehouse
      : undefined;

  return (
    <div>
      <PageBreadcrumb pageTitle="Zones" />
      <ZonesTable warehouseId={warehouseId} />
    </div>
  );
}