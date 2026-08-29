import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerCard from "@/components/customers/CustomerCard";
import CustomerDocumentsPanel from "@/components/customers/CustomerDocumentsPanel";
import CustomerOrderActions from "@/components/customers/CustomerOrderActions";
import CustomerPortalAccessCard from "@/components/customers/CustomerPortalAccessCard";

export const metadata: Metadata = {
  title: "Customer Card | Modulex Admin",
  description: "Customer master data, pricing, contacts, addresses and portal access",
};

export default async function CustomerCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Card" />
      <CustomerOrderActions />
      <CustomerCard />
      <div className="mt-5">
        <CustomerPortalAccessCard customerId={id} />
      </div>
      <div className="mt-5">
        <CustomerDocumentsPanel customerId={id} />
      </div>
    </div>
  );
}
