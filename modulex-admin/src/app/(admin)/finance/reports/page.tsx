import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceReportsWorkspace from "@/components/finance/reports/FinanceReportsWorkspace";

export const metadata: Metadata = {
  title: "Finance Reports | Modulex Admin",
  description: "Review canonical Finance cash flow, operating results, AR/AP and Project-linked actuals",
};

export default function FinanceReportsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Finance Reports" />
      <FinanceReportsWorkspace />
    </>
  );
}
