import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceArAgingManager from "@/components/finance/FinanceArAgingManager";

export const metadata: Metadata = {
  title: "AR Aging | Modulex Admin",
  description: "Accounts Receivable aging, Customer balances and payment history.",
};

export default function FinanceArAgingPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="AR Aging" />
      <FinanceArAgingManager />
    </>
  );
}
