import { products } from "@/data/products";
import ShopClient from "./ShopClient";

export async function generateStaticParams() {
  return products.map((product) => ({
    slug: product.slug,
  }));
}

interface ShopDetailProps {
  params: Promise<{
    slug: string;
  }>;
}

export default function Page({ params }: ShopDetailProps) {
  return <ShopClient params={params} />;
}