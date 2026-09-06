import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PerformanceManager from "@/components/hr/PerformanceManager";

export const metadata: Metadata = {
  title: "Performance | Modulex Admin",
  description: "Employee performance review management",
};

export default function PerformancePage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Performance" />
      <PerformanceManager />
    </div>
  );
}
