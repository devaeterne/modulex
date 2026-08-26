import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CompanyProfileSettings from "@/components/settings/CompanyProfileSettings";

export const metadata: Metadata = { title: "Company Settings | Modulex Admin", description: "Manage company identity and contact information" };

export default function CompanySettingsPage() {
  return <div><PageBreadcrumb pageTitle="Company Settings" /><CompanyProfileSettings /></div>;
}
