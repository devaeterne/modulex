import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import NewCustomerOrder from "@/components/customers/NewCustomerOrder";

export const metadata: Metadata = {
  title: "New Customer Order | Modulex Admin",
  description: "Create a customer order",
};

export default async function NewCustomerOrderPage({
  searchParams,
}: {
  searchParams: Promise<{
    projectId?: string;
    proposalRevisionId?: string;
    proposalAreaIds?: string;
  }>;
}) {
  const {
    projectId = null,
    proposalRevisionId = null,
    proposalAreaIds = "",
  } = await searchParams;
  const selectedProposalAreaIds = proposalAreaIds.split(",").map((value) => value.trim()).filter(Boolean);

  return (
    <div>
      <PageBreadcrumb pageTitle="New Customer Order" />
      <NewCustomerOrder
        projectId={projectId}
        proposalRevisionId={proposalRevisionId}
        proposalAreaIds={selectedProposalAreaIds}
      />
    </div>
  );
}
