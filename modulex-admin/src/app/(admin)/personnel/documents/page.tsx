import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DocumentsManager from "@/components/hr/DocumentsManager";

export const metadata: Metadata = {
  title: "Employee Documents | Modulex Admin",
  description: "Secure personnel document management",
};

export default function DocumentsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Employee Documents" />
      <DocumentsManager />
    </div>
  );
}
