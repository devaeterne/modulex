import type { Metadata } from "next";
import BenefitsManager from "@/components/hr/BenefitsManager";

export const metadata: Metadata = {
  title: "Benefits | Modulex Admin",
  description: "Employee benefits plans and enrollments",
};

export default function BenefitsPage() {
  return <BenefitsManager />;
}
