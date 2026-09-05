import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AdminCalendarWorkspace from "@/components/calendar/AdminCalendarWorkspace";

export const metadata: Metadata = {
  title: "Calendar | Modulex Admin",
  description: "Modulex Project, delivery, Installation and imported Google schedules",
};

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Calendar" />
      <AdminCalendarWorkspace />
    </div>
  );
}
