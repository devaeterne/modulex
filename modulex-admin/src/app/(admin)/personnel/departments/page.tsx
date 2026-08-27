import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DepartmentsManager from "@/components/hr/DepartmentsManager";

export const metadata: Metadata = {
  title: "Departments | Modulex Admin",
  description: "Manage HR departments",
};

export default function DepartmentsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Departments" />
      <DepartmentsManager />
    </div>
  );
}
