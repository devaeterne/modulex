import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreMediaLibraryManager from "@/components/store/StoreMediaLibraryManager";

export const metadata: Metadata = {
  title: "Store Media Library | Modulex Admin",
  description: "Review Oakwell media assets, provenance and publication lifecycle",
};

export default function StoreMediaLibraryPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Media Library" />
      <StoreMediaLibraryManager />
    </div>
  );
}
