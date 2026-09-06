import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceApAgingManager from "@/components/finance/FinanceApAgingManager";

export const metadata: Metadata = {
  title: "AP Aging | Modulex Admin",
  description: "Review vendor payable aging, payment schedules and check lifecycle projections",
};

export default function FinanceApAgingPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="AP Aging" />
      <FinanceApAgingManager />
    </>
  );
}
