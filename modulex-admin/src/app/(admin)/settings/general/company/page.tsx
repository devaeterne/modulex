import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CompanyProfileSettings from "@/components/settings/CompanyProfileSettings";
import DocumentBrandingSettings from "@/components/settings/DocumentBrandingSettings";

export const metadata: Metadata = {
  title: "Company Settings | Modulex Admin",
  description: "Manage company identity, logo variants and contact information",
};

export default function CompanySettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Company Settings" />
      <div className="space-y-5">
        <CompanyProfileSettings />
        <DocumentBrandingSettings />
      </div>
    </div>
  );
}
