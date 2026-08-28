import { permanentRedirect } from "next/navigation";

interface LegacyShopDetailProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function LegacyShopDetail({ params }: LegacyShopDetailProps) {
  const { slug } = await params;
  permanentRedirect(`/products/${slug}`);
}
