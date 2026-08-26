import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerInstallationDetail from "@/components/customers/CustomerInstallationDetail";

export const metadata: Metadata = {
  title: "Installation Detail | Modulex Admin",
  description: "Installation appointment detail and workflow",
};

export default function InstallationDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Installation Detail" />
      <CustomerInstallationDetail />
    </div>
  );
}
