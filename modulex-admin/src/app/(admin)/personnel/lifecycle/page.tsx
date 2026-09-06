import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import EmployeeTasksManager from "@/components/hr/EmployeeTasksManager";

export const metadata: Metadata = {
  title: "Onboarding & Offboarding | Modulex Admin",
  description: "Employee lifecycle task management",
};

export default function LifecyclePage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Onboarding & Offboarding" />
      <EmployeeTasksManager />
    </div>
  );
}
