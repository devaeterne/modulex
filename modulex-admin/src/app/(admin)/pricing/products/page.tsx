import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Prices | Modulex Admin",
  description: "Manage product prices in Modulex Admin",
};

export default function ProductPricesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Product Prices" />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Product Prices
        </h2>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Product price management will be available here.
        </p>
      </div>
    </div>
  );
}