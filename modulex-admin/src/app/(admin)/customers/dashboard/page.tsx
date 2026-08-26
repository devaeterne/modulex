import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerDashboard from "@/components/customers/CustomerDashboard";

export const metadata: Metadata = {
  title: "Customer Dashboard | Modulex Admin",
  description: "Customer and order overview",
};

export default function CustomerDashboardPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Dashboard" />
      <CustomerDashboard />
    </div>
  );
}
