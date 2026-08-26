import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import GeneralSettingsManager from "@/components/settings/GeneralSettingsManager";

export const metadata: Metadata = {
  title: "Company & General Settings | Modulex Admin",
  description: "Manage company identity, contact information and document defaults",
};

export default function GeneralSettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Company & General Settings" />
      <GeneralSettingsManager />
    </div>
  );
}
