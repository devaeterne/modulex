import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopReferenceManager from "@/components/countertop/CountertopReferenceManager";

export const metadata: Metadata = { title: "Countertop References | Modulex Admin" };

export default function CountertopReferenceSettingsPage() {
  return <><PageBreadcrumb pageTitle="Countertop References" /><CountertopReferenceManager /></>;
}
