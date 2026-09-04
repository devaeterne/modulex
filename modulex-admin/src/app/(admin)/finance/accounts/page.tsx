import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import FinanceAccountsManager from "@/components/finance/FinanceAccountsManager";

export const metadata: Metadata = {
  title: "Cash & Bank | Modulex Admin",
  description: "Finance accounts, operational categories and FX observations",
};

export default function FinanceAccountsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="Cash & Bank" />
      <FinanceAccountsManager />
    </>
  );
}
