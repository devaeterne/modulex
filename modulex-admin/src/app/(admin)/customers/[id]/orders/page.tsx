import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerOrdersList from "@/components/customers/CustomerOrdersList";

export const metadata: Metadata = {
  title: "Customer Orders | Modulex Admin",
  description: "Customer order history",
};

export default async function CustomerOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Orders" />
      <CustomerOrdersList customerId={id} />
    </div>
  );
}
