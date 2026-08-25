import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProductForm from "@/components/products/ProductForm";

export const metadata: Metadata = {
  title: "Create Product | Modulex Admin",
  description: "Create a new Modulex product",
};

export default function CreateProductPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Create Product" />
      <ProductForm mode="create" />
    </div>
  );
}