import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CategoriesTable from "@/components/categories/CategoriesTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Categories | Modulex Admin",
  description: "Manage product categories in Modulex Admin",
};

export default function CategoriesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Categories" />
      <CategoriesTable />
    </div>
  );
}