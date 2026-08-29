import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreLeadFormOptionsManager from "@/components/store/StoreLeadFormOptionsManager";

export const metadata: Metadata = {
  title: "Lead Form Options | Modulex Admin",
  description: "Manage public project consultation form options.",
};

export default function StoreLeadFormOptionsPage() {
  return <div className="space-y-6"><PageBreadcrumb pageTitle="Lead Form Options" /><StoreLeadFormOptionsManager /></div>;
}
