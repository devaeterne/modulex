import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import NotificationDeliveryRules from "@/components/settings/NotificationDeliveryRules";

export const metadata: Metadata = { title: "Notification Settings | Modulex Admin", description: "Manage email, panel and sound notification delivery rules" };

export default function NotificationSettingsPage() {
  return <div><PageBreadcrumb pageTitle="Notification Settings" /><NotificationDeliveryRules /></div>;
}
