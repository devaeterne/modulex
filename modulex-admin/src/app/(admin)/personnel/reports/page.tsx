import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import HrReports from "@/components/hr/HrReports";

export const metadata: Metadata = {
  title: "HR Reports | Modulex Admin",
  description: "Workforce and payroll HR reporting",
};

export default function HrReportsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="HR Reports" />
      <HrReports />
    </div>
  );
}
