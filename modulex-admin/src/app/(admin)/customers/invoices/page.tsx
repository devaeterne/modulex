import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerInvoicesList from "@/components/customers/CustomerInvoicesList";

export const metadata: Metadata = {
  title: "Customer Invoices | Modulex Admin",
  description: "View customer invoices and balances",
};

export default function CustomerInvoicesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Invoices" />
      <CustomerInvoicesList />
    </div>
  );
}
