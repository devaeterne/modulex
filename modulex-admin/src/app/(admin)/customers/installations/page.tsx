import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerInstallationsList from "@/components/customers/CustomerInstallationsList";

export const metadata: Metadata = {
  title: "Installations | Modulex Admin",
  description: "Installation appointments and field scheduling",
};

export default function InstallationsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Installations" />
      <CustomerInstallationsList />
    </div>
  );
}
