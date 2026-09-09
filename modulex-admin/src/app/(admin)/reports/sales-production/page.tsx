import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import SalesProductionReport from "@/components/reports/SalesProductionReport";

export const metadata: Metadata = {
  title: "Sales & Production Report | Modulex Admin",
  description: "Review order-level sales, countertop production, receivables, salesperson and territory performance",
};

export default function SalesProductionReportPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Sales & Production Report" />
      <SalesProductionReport />
    </>
  );
}