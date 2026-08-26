import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerOrderDetail from "@/components/customers/CustomerOrderDetail";
import CustomerOrderEditActions from "@/components/customers/CustomerOrderEditActions";
import CustomerOrderRevisionHistory from "@/components/customers/CustomerOrderRevisionHistory";
import CreateInvoiceFromOrderButton from "@/components/customers/CreateInvoiceFromOrderButton";
import CreateShipmentFromOrderButton from "@/components/customers/CreateShipmentFromOrderButton";

export const metadata: Metadata = {
  title: "Order Detail | Modulex Admin",
  description: "Customer order detail, status and revision history",
};

export default function CustomerOrderDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Order Detail" />
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateShipmentFromOrderButton />
        <CreateInvoiceFromOrderButton />
      </div>
      <CustomerOrderEditActions />
      <CustomerOrderDetail />
      <CustomerOrderRevisionHistory />
    </div>
  );
}
