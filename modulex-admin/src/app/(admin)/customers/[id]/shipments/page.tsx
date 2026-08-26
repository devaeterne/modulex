import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerShipmentsList from "@/components/customers/CustomerShipmentsList";

export const metadata: Metadata = {
  title: "Customer Shipments | Modulex Admin",
  description: "Shipment history for a customer",
};

export default async function CustomerShipmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Shipments" />
      <CustomerShipmentsList customerId={id} />
    </div>
  );
}
