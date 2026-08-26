import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerOrderDetail from "@/components/customers/CustomerOrderDetail";
import CustomerOrderEditActions from "@/components/customers/CustomerOrderEditActions";
import CustomerOrderRevisionHistory from "@/components/customers/CustomerOrderRevisionHistory";
import CreateInvoiceFromOrderButton from "@/components/customers/CreateInvoiceFromOrderButton";

export const metadata: Metadata = {
  title: "Order Detail | Modulex Admin",
  description: "Customer order detail, status and revision history",
};

export default function CustomerOrderDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Order Detail" />
      <div className="mb-5 flex justify-end">
        <CreateInvoiceFromOrderButton />
      </div>
      <CustomerOrderEditActions />
      <CustomerOrderDetail />
      <CustomerOrderRevisionHistory />
    </div>
  );
}
