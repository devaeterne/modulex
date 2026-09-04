import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceOverview from "@/components/finance/FinanceOverview";

export const metadata: Metadata = {
  title: "Finance Overview | Modulex Admin",
  description: "Finance Core account balances and transaction status",
};

export default function FinanceOverviewPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Finance Overview" />
      <FinanceOverview />
    </>
  );
}
