import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinancePaymentScheduleManager from "@/components/finance/FinancePaymentScheduleManager";

export const metadata: Metadata = {
  title: "Payment Schedule | Modulex Admin",
  description: "Plan vendor bill payment dates separately from due dates and actual settlement",
};

export default function FinancePaymentSchedulePage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Payment Schedule" />
      <FinancePaymentScheduleManager />
    </>
  );
}
