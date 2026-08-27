import type { Metadata } from "next";
import EmployeeTasksManager from "@/components/hr/EmployeeTasksManager";

export const metadata: Metadata = {
  title: "Onboarding & Offboarding | Modulex Admin",
  description: "Employee lifecycle task management",
};

export default function LifecyclePage() {
  return <EmployeeTasksManager />;
}
