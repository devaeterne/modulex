import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TaxonomyManager from "@/components/products/TaxonomyManager";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brands | Modulex Admin",
  description: "Manage product brands in Modulex Admin",
};

export default function BrandsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Brands" />
      <TaxonomyManager entityLabel="Brand" entityLabelPlural="Brands" tableName="product_brands" />
    </div>
  );
}
