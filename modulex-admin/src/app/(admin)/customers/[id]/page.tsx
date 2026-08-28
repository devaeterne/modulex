import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerCard from "@/components/customers/CustomerCard";
import CustomerOrderActions from "@/components/customers/CustomerOrderActions";
import DealerPortalAccessCard from "@/components/customers/DealerPortalAccessCard";

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
      <div className="mb-5">
        <DealerPortalAccessCard customerId={id} />
      </div>
      <CustomerCard />
    </div>
  );
}
