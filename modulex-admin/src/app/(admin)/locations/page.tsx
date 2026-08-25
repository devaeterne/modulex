import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LocationsTable from "@/components/locations/LocationsTable";

export const metadata: Metadata = {
  title: "Locations | Modulex Admin",
  description: "Manage Modulex warehouse shelf locations",
};

export default function LocationsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Locations" />
      <LocationsTable />
    </div>
  );
}