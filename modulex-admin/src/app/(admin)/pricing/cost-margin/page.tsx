import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CostMarginTable from "@/components/pricing/CostMarginTable";

export const metadata: Metadata = {
  title: "Cost & Margin | Modulex Admin",
  description:
    "Manage product costs and monitor margins across price groups",
};

export default function CostMarginPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Cost & Margin" />
      <CostMarginTable />
    </div>
  );
}