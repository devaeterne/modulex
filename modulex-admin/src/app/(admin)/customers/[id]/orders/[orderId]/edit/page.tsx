import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import EditCustomerOrder from "@/components/customers/EditCustomerOrder";
import CustomerOrderReferenceEditor from "@/components/customers/CustomerOrderReferenceEditor";

export const metadata: Metadata = {
  title: "Edit Order | Modulex Admin",
  description: "Revise an existing customer order without recreating it",
};

export default async function EditCustomerOrderPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  const { id, orderId } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Order" />
      <CustomerOrderReferenceEditor customerId={id} orderId={orderId} />
      <EditCustomerOrder />
    </div>
  );
}
