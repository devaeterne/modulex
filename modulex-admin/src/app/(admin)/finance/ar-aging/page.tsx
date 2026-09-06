import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceArAgingManager from "@/components/finance/FinanceArAgingManager";

export const metadata: Metadata = {
  title: "AR Aging | Modulex Admin",
  description: "Review Customer AR aging, balances, Invoice settlement and canonical payment history",
};

export default function FinanceArAgingPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="AR Aging" />
      <FinanceArAgingManager />
    </>
  );
}
