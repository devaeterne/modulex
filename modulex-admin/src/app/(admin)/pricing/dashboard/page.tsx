import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PricingDashboard from "@/components/pricing/PricingDashboard";

export const metadata: Metadata = {
  title:
    "Pricing Dashboard | Modulex Admin",
  description:
    "Pricing, cost, margin and inventory value dashboard",
};

export default function PricingDashboardPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Pricing Dashboard" />

      <PricingDashboard />
    </div>
  );
}