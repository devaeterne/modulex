import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import EmployeeDirectory from "@/components/hr/EmployeeDirectory";

export const metadata: Metadata = {
  title: "Employees | Modulex Admin",
  description: "Manage employee master records",
};

export default function EmployeesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Employees" />
      <EmployeeDirectory />
    </div>
  );
}
