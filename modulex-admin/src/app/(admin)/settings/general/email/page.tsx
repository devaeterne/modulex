import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import EmailSettingsManager from "@/components/settings/EmailSettingsManager";

export const metadata: Metadata = { title: "Email Settings | Modulex Admin", description: "Manage transactional email sender and recipients" };

export default function EmailSettingsPage() {
  return <div><PageBreadcrumb pageTitle="Email Settings" /><EmailSettingsManager /></div>;
}
