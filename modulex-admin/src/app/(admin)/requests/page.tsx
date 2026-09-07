import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import RequestCenter from "@/components/requests/RequestCenter";
import RequestCenterAnnouncementAction from "@/components/requests/RequestCenterAnnouncementAction";

export const metadata: Metadata = {
  title: "Request Center | Modulex Admin",
  description: "Create, track and resolve internal requests",
};

export default function RequestsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Request Center" />
      <RequestCenterAnnouncementAction />
      <RequestCenter />
    </div>
  );
}
