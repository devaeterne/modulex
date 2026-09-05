import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceVendorsManager from "@/components/finance/FinanceVendorsManager";

export const metadata: Metadata = {
  title: "Finance Vendors | Modulex Admin",
  description: "Manage canonical vendors, source identities, contacts and compliance",
};

export default function FinanceVendorsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Finance Vendors" />
      <FinanceVendorsManager />
    </>
  );
}
