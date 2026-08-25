import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StockOperationForm from "@/components/stock-operations/StockOperationForm";

export const metadata: Metadata = {
  title: "Stock Operations | Modulex Admin",
  description: "Run Modulex stock in, stock out, transfer and reservation operations",
};

export default function StockOperationsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Stock Operations" />
      <StockOperationForm />
    </div>
  );
}