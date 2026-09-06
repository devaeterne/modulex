import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import BenefitsManager from "@/components/hr/BenefitsManager";

export const metadata: Metadata = {
  title: "Benefits | Modulex Admin",
  description: "Employee benefits plans and enrollments",
};

export default function BenefitsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Benefits" />
      <BenefitsManager />
    </div>
  );
}
