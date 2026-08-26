import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerInvoicesList from "@/components/customers/CustomerInvoicesList";

export const metadata: Metadata = {
  title: "Customer Invoices | Modulex Admin",
  description: "View invoices for a customer",
};

export default async function CustomerInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Invoices" />
      <CustomerInvoicesList customerId={id} />
    </div>
  );
}
