import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopReferenceManager from "@/components/countertop/CountertopReferenceManager";

export const metadata: Metadata = { title: "Countertop Setup | Modulex Admin" };

export default function CountertopReferenceSettingsPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Countertop Setup" />
      <CountertopReferenceManager />
    </div>
  );
}
