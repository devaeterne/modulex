import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LocalizationSettings from "@/components/settings/LocalizationSettings";

export const metadata: Metadata = { title: "Localization Settings | Modulex Admin", description: "Manage currency, locale and timezone defaults" };

export default function LocalizationSettingsPage() {
  return <div><PageBreadcrumb pageTitle="Localization" /><LocalizationSettings /></div>;
}
