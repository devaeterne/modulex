import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import EmailNotificationQueueManager from "@/components/settings/EmailNotificationQueueManager";

export const metadata: Metadata = {
  title: "Email Queue & Delivery Log | Modulex Admin",
  description: "Manage transactional email delivery and retry failed notifications",
};

export default function EmailNotificationManagementPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Email Queue & Delivery Log" />
      <EmailNotificationQueueManager />
    </div>
  );
}
