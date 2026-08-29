import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerInstallationsList from "@/components/customers/CustomerInstallationsList";

export const metadata: Metadata = {
  title: "Customer Installations | Modulex Admin",
  description: "Installation appointments for a customer",
};

export default async function CustomerInstallationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Installations" />
      <CustomerInstallationsList customerId={id} />
    </div>
  );
}
