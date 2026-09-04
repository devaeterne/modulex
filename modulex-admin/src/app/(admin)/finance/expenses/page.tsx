import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceExpensesManager from "@/components/finance/FinanceExpensesManager";

export const metadata: Metadata = {
  title: "Finance Expenses | Modulex Admin",
  description: "Create, post, review and void Finance-owned company expenses",
};

export default function FinanceExpensesPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Finance Expenses" />
      <FinanceExpensesManager />
    </>
  );
}
