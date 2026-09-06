import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceCustomerReceiptsManager from "@/components/finance/FinanceCustomerReceiptsManager";

export const metadata: Metadata = {
  title: "Customer Receipts | Modulex Admin",
  description: "Record and reconcile customer receipt allocations against open invoices",
};

export default function FinanceCustomerReceiptsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Customer Receipts" />
      <FinanceCustomerReceiptsManager />
    </>
  );
}
