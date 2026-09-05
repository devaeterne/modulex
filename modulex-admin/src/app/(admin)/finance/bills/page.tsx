import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceVendorBillsManager from "@/components/finance/FinanceVendorBillsManager";

export const metadata: Metadata = {
  title: "Vendor Bills | Modulex Admin",
  description: "Manage vendor bills, due dates, source allocations and AP settlement",
};

export default function FinanceVendorBillsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Vendor Bills" />
      <FinanceVendorBillsManager />
    </>
  );
}
