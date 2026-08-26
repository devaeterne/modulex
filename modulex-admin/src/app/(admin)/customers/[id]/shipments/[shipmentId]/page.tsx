import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerShipmentDetail from "@/components/customers/CustomerShipmentDetail";

export const metadata: Metadata = {
  title: "Shipment Detail | Modulex Admin",
  description: "Customer shipment and warehouse fulfillment",
};

export default function CustomerShipmentDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Shipment Detail" />
      <CustomerShipmentDetail />
    </div>
  );
}
