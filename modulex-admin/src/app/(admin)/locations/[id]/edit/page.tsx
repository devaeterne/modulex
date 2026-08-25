import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LocationForm from "@/components/locations/LocationForm";

type EditLocationPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Location | Modulex Admin",
  description:
    "Edit a Modulex warehouse location",
};

export default async function EditLocationPage({
  params,
}: EditLocationPageProps) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Location" />

      <LocationForm
        mode="edit"
        locationId={id}
      />
    </div>
  );
}