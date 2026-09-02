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
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId = null } = await searchParams;

  return (
    <div>
      <PageBreadcrumb pageTitle="New Customer Order" />
      <NewCustomerOrder projectId={projectId} />
    </div>
  );
}
