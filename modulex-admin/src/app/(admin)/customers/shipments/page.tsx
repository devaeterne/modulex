import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerShipmentsList from "@/components/customers/CustomerShipmentsList";

export const metadata: Metadata = {
  title: "Shipments | Modulex Admin",
  description: "Customer shipment and warehouse fulfillment management",
};

export default function CustomerShipmentsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Shipments" />
      <CustomerShipmentsList />
    </div>
  );
}
