import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LocationForm from "@/components/locations/LocationForm";

type NewLocationPageProps = {
  searchParams: Promise<{
    zone?: string | string[];
    warehouse?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Add Location | Modulex Admin",
  description:
    "Create a new Modulex warehouse location",
};

export default async function NewLocationPage({
  searchParams,
}: NewLocationPageProps) {
  const params = await searchParams;

  const initialZoneId =
    typeof params.zone === "string"
      ? params.zone
      : undefined;

  const initialWarehouseId =
    typeof params.warehouse === "string"
      ? params.warehouse
      : undefined;

  return (
    <div>
      <PageBreadcrumb pageTitle="Add Location" />

      <LocationForm
        mode="create"
        initialZoneId={initialZoneId}
        initialWarehouseId={
          initialWarehouseId
        }
      />
    </div>
  );
}