import type { Metadata } from "next";
import CompensationManager from "@/components/hr/CompensationManager";

export const metadata: Metadata = {
  title: "Compensation | Modulex Admin",
  description: "Personnel compensation, bonus, advances and deductions",
};

export default function CompensationPage() {
  return <CompensationManager />;
}
