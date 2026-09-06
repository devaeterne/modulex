import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PayrollManager from "@/components/hr/PayrollManager";

export const metadata: Metadata = {
  title: "Payroll | Modulex Admin",
  description: "Payroll periods, runs, taxes and payment workflow",
};

export default function PayrollPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Payroll" />
      <PayrollManager />
    </div>
  );
}
