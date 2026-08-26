import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CostMarginServerTable from "@/components/pricing/CostMarginServerTable";

export const metadata: Metadata = {
  title: "Cost & Margin | Modulex Admin",
  description:
    "Manage product costs and monitor margins across price groups",
};

export default function CostMarginPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Cost & Margin" />
      <CostMarginServerTable />
    </div>
  );
}
