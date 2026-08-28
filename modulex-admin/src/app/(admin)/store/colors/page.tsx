import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreColorsManager from "@/components/store/StoreColorsManager";

export const metadata: Metadata = {
  title: "Store Colors | Modulex Admin",
  description: "Manage public Store color labels and swatches",
};

export default function StoreColorsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Store Color Options" />
      <StoreColorsManager />
    </div>
  );
}
