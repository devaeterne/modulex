import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreMarketingSettings from "@/components/store/StoreMarketingSettings";

export const metadata: Metadata = {
  title: "Marketing & Analytics | Modulex Admin",
  description: "Manage Oakwell Store analytics, tag manager and consent settings",
};

export default function StoreMarketingPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Marketing & Analytics" />
      <StoreMarketingSettings />
    </div>
  );
}
