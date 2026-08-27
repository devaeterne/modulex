import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CostMarginAccessView from "@/components/pricing/CostMarginAccessView";

export const metadata: Metadata = {
  title: "Cost & Margin | Modulex Admin",
  description: "Review product costs and monitor margins across price groups",
};

export default function CostMarginPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Cost & Margin" />
      <CostMarginAccessView />
    </div>
  );
}
