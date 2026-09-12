import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceVendorBillsManager from "@/components/finance/FinanceVendorBillsManager";

export const metadata: Metadata = {
  title: "Vendor Payables | Modulex Admin",
  description: "Review vendor commitments, Vendor Bills, payment attribution and Payment Schedule",
};

export default function FinanceVendorBillsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Vendor Payables" />
      <FinanceVendorBillsManager />
    </>
  );
}
