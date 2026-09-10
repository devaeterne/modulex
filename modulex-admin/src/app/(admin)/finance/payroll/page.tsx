import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinancePayrollManager from "@/components/finance/FinancePayrollManager";

export const metadata: Metadata = {
  title: "Payroll Settlement | Modulex Admin",
  description: "Finance settlement of approved HR payroll obligations",
};

export default function FinancePayrollPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Payroll Settlement" />
      <FinancePayrollManager />
    </>
  );
}
