import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import GoogleCalendarSettings from "@/components/settings/GoogleCalendarSettings";

export const metadata: Metadata = {
  title: "Google Calendar | Modulex Admin",
  description: "Manage the Modulex Google Calendar integration and Project calendar behavior",
};

export default function GoogleCalendarSettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Google Calendar" />
      <GoogleCalendarSettings />
    </div>
  );
}
