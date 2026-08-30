import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TaxonomyManager from "@/components/products/TaxonomyManager";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Categories | Modulex Admin",
  description: "Manage product categories in Modulex Admin",
};

export default function CategoriesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Categories" />
      <TaxonomyManager entityLabel="Category" entityLabelPlural="Categories" tableName="product_categories" />
    </div>
  );
}
