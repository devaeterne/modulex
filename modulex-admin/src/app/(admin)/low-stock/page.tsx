import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LowStockManager from "@/components/inventory/LowStockManager";

export const metadata: Metadata = {
  title: "Low Stock | Modulex Admin",
  description: "Monitor low stock and manage minimum stock thresholds",
};

export default function LowStockPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Low Stock" />
      <LowStockManager />
    </div>
  );
}
