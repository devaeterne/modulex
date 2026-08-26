import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerOrdersList from "@/components/customers/CustomerOrdersList";

export const metadata: Metadata = {
  title: "Customer Orders | Modulex Admin",
  description: "View all customer orders",
};

export default function CustomerOrdersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Orders" />
      <CustomerOrdersList />
    </div>
  );
}
