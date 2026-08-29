import type { Metadata } from "next";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreLeadsTable from "@/components/store/StoreLeadsTable";

export const metadata: Metadata = {
  title: "Store Leads | Modulex Admin",
  description: "Review website inquiries, project consultations, and dealer applications",
};

export default function StoreLeadsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Leads & Dealer Applications" />
      <div className="mb-5 flex justify-end"><Link href="/store/leads/form-options" className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">Manage Consultation Options</Link></div>
      <StoreLeadsTable />
    </div>
  );
}
