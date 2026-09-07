import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopReferenceManager from "@/components/countertop/CountertopReferenceManager";

export const metadata: Metadata = { title: "Additional Services | Modulex Admin" };

export default function CountertopAdditionalServicesPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Additional Services" />
      <CountertopReferenceManager kinds={["service"]} />
    </div>
  );
}
