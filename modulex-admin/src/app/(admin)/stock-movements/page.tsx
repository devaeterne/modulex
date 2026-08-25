import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StockMovementsTable from "@/components/stock-movements/StockMovementsTable";

export const metadata: Metadata = {
  title: "Stock Movements | Modulex Admin",
  description: "View Modulex inventory movement history",
};

export default function StockMovementsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Stock Movements" />
      <StockMovementsTable />
    </div>
  );
}