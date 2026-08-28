import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreProductEditor from "@/components/store/StoreProductEditor";

export const metadata: Metadata = {
  title: "Edit Store Product | Modulex Admin",
  description: "Edit Oakwell Store product presentation content",
};

type StoreProductEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function StoreProductEditPage({ params }: StoreProductEditPageProps) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Store Product" />
      <StoreProductEditor productContentId={id} />
    </div>
  );
}
