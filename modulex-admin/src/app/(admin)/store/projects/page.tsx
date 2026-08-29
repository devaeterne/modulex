import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreProjectsManager from "@/components/store/StoreProjectsManager";

export const metadata: Metadata = {
  title: "Store Projects | Modulex Admin",
  description: "Manage Oakwell public project content, media and publishing",
};

export default function StoreProjectsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Projects" />
      <StoreProjectsManager />
    </div>
  );
}
