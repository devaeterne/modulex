import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerInvoiceDetail from "@/components/customers/CustomerInvoiceDetail";

export const metadata: Metadata = {
  title: "Invoice Detail | Modulex Admin",
  description: "Customer invoice detail and payment state",
};

export default function CustomerInvoiceDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Invoice Detail" />
      <CustomerInvoiceDetail />
    </div>
  );
}
