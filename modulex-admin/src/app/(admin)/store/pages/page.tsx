import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StorePagesManager from "@/components/store/StorePagesManager";

export const metadata: Metadata = {
  title: "Store Pages | Modulex Admin",
  description: "Manage Oakwell secondary public page content and publishing",
};

export default function StorePagesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Pages" />
      <StorePagesManager />
    </div>
  );
}
