import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceTransactionsManager from "@/components/finance/FinanceTransactionsManager";

export const metadata: Metadata = {
  title: "Finance Transactions | Modulex Admin",
  description: "Create, post, void and reverse Finance Core transactions",
};

export default function FinanceTransactionsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Finance Transactions" />
      <FinanceTransactionsManager />
    </>
  );
}
