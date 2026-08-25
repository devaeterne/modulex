import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ZoneForm from "@/components/zones/ZoneForm";
import { Metadata } from "next";

type EditZonePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Zone | Modulex Admin",
  description: "Edit warehouse zone in Modulex Admin",
};

export default async function EditZonePage({
  params,
}: EditZonePageProps) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Zone" />

      <ZoneForm
        mode="edit"
        zoneId={id}
      />
    </div>
  );
}