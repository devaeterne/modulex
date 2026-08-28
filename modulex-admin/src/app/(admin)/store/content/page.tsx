import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreContentSettings from "@/components/store/StoreContentSettings";

export const metadata: Metadata = {
  title: "Store Content | Modulex Admin",
  description: "Manage Oakwell public site homepage, footer and social content",
};

export default function StoreContentPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Content" />
      <StoreContentSettings />
    </div>
  );
}
