import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import RequestCenter from "@/components/requests/RequestCenter";

export const metadata: Metadata = {
  title: "Request Center | Modulex Admin",
  description: "Create, track and resolve internal requests",
};

export default function RequestsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Request Center" />
      <RequestCenter />
    </div>
  );
}
