import type { Metadata } from "next";
import ComplianceManager from "@/components/hr/ComplianceManager";

export const metadata: Metadata = {
  title: "Compliance & Emergency | Modulex Admin",
  description: "Employee tax profile, I-9/W-4 compliance and emergency contacts",
};

export default function CompliancePage() {
  return <ComplianceManager />;
}
