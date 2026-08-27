import type { Metadata } from "next";
import PayrollManager from "@/components/hr/PayrollManager";

export const metadata: Metadata = {
  title: "Payroll | Modulex Admin",
  description: "Finance payroll processing",
};

export default function FinancePayrollPage() {
  return <PayrollManager />;
}
