import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreReviewsManager from "@/components/store/StoreReviewsManager";

export const metadata: Metadata = {
  title: "Reviews & Social Proof | Modulex Admin",
  description: "Manage attributed Store review excerpts and social proof",
};

export default function StoreReviewsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Reviews & Social Proof" />
      <StoreReviewsManager />
    </div>
  );
}
