import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import GeneralSettingsOverview from "@/components/settings/GeneralSettingsOverview";

export const metadata: Metadata = {
  title: "General Settings | Modulex Admin",
  description: "Manage company, document, email and notification settings",
};

export default function GeneralSettingsPage() {
  return <div><PageBreadcrumb pageTitle="General Settings" /><GeneralSettingsOverview /></div>;
}
