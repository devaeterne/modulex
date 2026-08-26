import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerCard from "@/components/customers/CustomerCard";
import CustomerOrderActions from "@/components/customers/CustomerOrderActions";

export const metadata: Metadata = {
  title: "Customer Card | Modulex Admin",
  description: "Customer master data, pricing, contacts, addresses and portal access",
};

export default function CustomerCardPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Card" />
      <CustomerOrderActions />
      <CustomerCard />
    </div>
  );
}
