import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreLeadDetail from "@/components/store/StoreLeadDetail";
import StoreLeadDocuments from "@/components/store/StoreLeadDocuments";
import StoreDealerOnboardingActions from "@/components/store/StoreDealerOnboardingActions";

export const metadata: Metadata = {
  title: "Store Lead | Modulex Admin",
  description: "Review and manage a Store lead or dealer application",
};

export default async function StoreLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Lead" />
      <StoreLeadDetail id={id} />
      <StoreDealerOnboardingActions leadId={id} />
      <StoreLeadDocuments id={id} />
    </div>
  );
}
