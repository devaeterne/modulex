import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";

export const metadata: Metadata = { title: "Countertop Configuration | Modulex Admin", description: "Configure countertop pricing and order snapshots" };

export default function CountertopPage() {
  return <div><PageBreadcrumb pageTitle="Countertop Configuration" /><CountertopConfigurator /></div>;
}
