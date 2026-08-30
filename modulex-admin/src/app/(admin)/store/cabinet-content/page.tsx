import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreCabinetContentManager from "@/components/store/StoreCabinetContentManager";

export const metadata: Metadata = {
  title: "Cabinet Content | Modulex Admin",
  description: "Manage Oakwell cabinet planning process and FAQ content",
};

export default function StoreCabinetContentPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Cabinet Content" />
      <StoreCabinetContentManager />
    </div>
  );
}
