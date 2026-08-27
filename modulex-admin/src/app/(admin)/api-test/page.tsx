import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ApiTestPanel from "@/components/system/ApiTestPanel";

export const metadata: Metadata = {
  title: "API Test | Modulex Admin",
  description: "Run safe authenticated API and RLS smoke checks for Modulex Admin",
};

export default function ApiTestPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="API Test" />
      <ApiTestPanel />
    </div>
  );
}
