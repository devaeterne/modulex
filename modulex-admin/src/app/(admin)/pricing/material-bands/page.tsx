import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import MaterialBandPricingTable from "@/components/pricing/MaterialBandPricingTable";

export const metadata: Metadata = {
  title: "Material Bands | Modulex Admin",
  description: "Manage countertop material band pricing",
};

export default function MaterialBandsPricingPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Material Bands" />
      <MaterialBandPricingTable />
    </div>
  );
}
