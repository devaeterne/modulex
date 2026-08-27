import type { Metadata } from "next";
import CompensationManager from "@/components/hr/CompensationManager";

export const metadata: Metadata = {
  title: "Compensation | Modulex Admin",
  description: "Finance compensation visibility",
};

export default function FinanceCompensationPage() {
  return <CompensationManager />;
}
