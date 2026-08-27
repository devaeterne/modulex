import type { Metadata } from "next";
import PayrollManager from "@/components/hr/PayrollManager";

export const metadata: Metadata = {
  title: "Payroll | Modulex Admin",
  description: "Payroll periods, runs, taxes and payment workflow",
};

export default function PayrollPage() {
  return <PayrollManager />;
}
