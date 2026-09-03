import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProductForm from "@/components/products/ProductForm";
import ProductMediaPanel from "@/components/products/ProductMediaPanel";

export const metadata: Metadata = {
  title: "Edit Product | Modulex Admin",
  description: "Edit Modulex product",
};

type EditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Product" />
      <div className="space-y-6">
        <ProductForm mode="edit" productId={id} />
        <ProductMediaPanel productId={id} />
      </div>
    </div>
  );
}