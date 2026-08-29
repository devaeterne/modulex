import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StoreCompanyManager from "@/components/store/StoreCompanyManager";

export const metadata: Metadata = {
  title: "Store Company | Modulex Admin",
  description: "Manage public company identity, contact channels, locations, showrooms and business hours.",
};

export default function StoreCompanyPage() {
  return <div className="space-y-6"><PageBreadcrumb pageTitle="Store Company" /><StoreCompanyManager /></div>;
}
