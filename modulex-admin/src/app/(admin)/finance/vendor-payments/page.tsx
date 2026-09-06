import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceVendorPaymentsManager from "@/components/finance/FinanceVendorPaymentsManager";

export const metadata: Metadata = {
  title: "Vendor Payments | Modulex Admin",
  description: "Manage vendor payments, bill allocations and check lifecycle",
};

export default function FinanceVendorPaymentsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Vendor Payments" />
      <FinanceVendorPaymentsManager />
    </>
  );
}
