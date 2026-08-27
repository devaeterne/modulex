import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import MovementReport from "@/components/reports/MovementReport";

export const metadata: Metadata = {
  title: "Movement Reports | Modulex Admin",
  description: "Inventory movement analysis and reporting",
};

export default function MovementReportsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Movement Reports" />
      <MovementReport />
    </div>
  );
}
