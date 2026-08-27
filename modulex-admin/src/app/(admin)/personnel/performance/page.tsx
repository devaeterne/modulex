import type { Metadata } from "next";
import PerformanceManager from "@/components/hr/PerformanceManager";

export const metadata: Metadata = {
  title: "Performance | Modulex Admin",
  description: "Employee performance review management",
};

export default function PerformancePage() {
  return <PerformanceManager />;
}
