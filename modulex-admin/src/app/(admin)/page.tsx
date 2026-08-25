import type { Metadata } from "next";
import ModulexDashboard from "@/components/dashboard/ModulexDashboard";

export const metadata: Metadata = {
  title: "Dashboard | Modulex Admin",
  description: "Modulex ERP dashboard overview",
};

export default function DashboardPage() {
  return <ModulexDashboard />;
}