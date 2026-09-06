import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerProjectsList from "@/components/customers/CustomerProjectsList";

export const metadata: Metadata = {
  title: "Customer Projects | Modulex Admin",
  description: "Customer-scoped projects and project creation",
};

export default async function CustomerProjectsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Projects" />
      <CustomerProjectsList customerId={id} />
    </div>
  );
}
