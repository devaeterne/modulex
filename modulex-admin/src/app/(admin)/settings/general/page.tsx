import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import GeneralSettingsManager from "@/components/settings/GeneralSettingsManager";
import InvoiceDocumentSettings from "@/components/settings/InvoiceDocumentSettings";
import EmailNotificationSettings from "@/components/settings/EmailNotificationSettings";
import NotificationDeliveryRules from "@/components/settings/NotificationDeliveryRules";

export const metadata: Metadata = {
  title: "Company & General Settings | Modulex Admin",
  description: "Manage company identity, contact information and document defaults",
};

export default function GeneralSettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Company & General Settings" />
      <GeneralSettingsManager />
      <InvoiceDocumentSettings />
      <EmailNotificationSettings />
      <NotificationDeliveryRules />
    </div>
  );
}
