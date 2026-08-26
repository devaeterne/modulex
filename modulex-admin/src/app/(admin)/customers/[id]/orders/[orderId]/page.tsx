import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerOrderDetail from "@/components/customers/CustomerOrderDetail";

export const metadata: Metadata = {
  title: "Order Detail | Modulex Admin",
  description: "Customer order detail and status history",
};

export default function CustomerOrderDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Order Detail" />
      <CustomerOrderDetail />
    </div>
  );
}
