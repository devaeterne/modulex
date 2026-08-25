import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ZoneForm from "@/components/zones/ZoneForm";
import { Metadata } from "next";

type NewZonePageProps = {
  searchParams: Promise<{
    warehouse?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Create Zone | Modulex Admin",
  description: "Create a warehouse zone in Modulex Admin",
};

export default async function NewZonePage({
  searchParams,
}: NewZonePageProps) {
  const params = await searchParams;

  const initialWarehouseId =
    typeof params.warehouse === "string"
      ? params.warehouse
      : undefined;

  return (
    <div>
      <PageBreadcrumb pageTitle="Create Zone" />

      <ZoneForm
        mode="create"
        initialWarehouseId={initialWarehouseId}
      />
    </div>
  );
}