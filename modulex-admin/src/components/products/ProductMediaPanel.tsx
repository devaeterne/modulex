"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import FormHint from "@/components/form/FormHint";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import { supabase } from "@/lib/supabase/client";

type ProductIdentity = {
  sku: string;
  name: string;
  base_product_code: string | null;
};

type ProductMediaRow = {
  id: string;
  url: string;
  alt_text: string | null;
  title: string | null;
  sort_order: number;
  is_primary: boolean;
  storage_bucket: string | null;
  storage_path: string | null;
};

type ProductMediaPanelProps = {
  productId: string;
};

function messageFromError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function ProductMediaPanel({ productId }: ProductMediaPanelProps) {
  const [product, setProduct] = useState<ProductIdentity | null>(null);
  const [media, setMedia] = useState<ProductMediaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMedia() {
      setIsLoading(true);
      setErrorMessage(null);

      const { data: productRow, error: productError } = await supabase
        .from("products")
        .select("sku,name,base_product_code")
        .eq("id", productId)
        .maybeSingle();

      if (cancelled) return;
      if (productError || !productRow) {
        setProduct(null);
        setMedia([]);
        setErrorMessage(
          messageFromError(productError, "Product media identity could not be loaded.")
        );
        setIsLoading(false);
        return;
      }

      const identity = productRow as ProductIdentity;
      setProduct(identity);
      const baseProductCode = identity.base_product_code || identity.sku;

      const { data: content, error: contentError } = await supabase
        .from("store_product_content")
        .select("id")
        .eq("base_product_code", baseProductCode)
        .maybeSingle();

      if (cancelled) return;
      if (contentError) {
        setMedia([]);
        setErrorMessage(
          messageFromError(contentError, "Product media content could not be loaded.")
        );
        setIsLoading(false);
        return;
      }

      if (!content?.id) {
        setMedia([]);
        setIsLoading(false);
        return;
      }

      const { data: mediaRows, error: mediaError } = await supabase
        .from("store_product_media")
        .select(
          "id,url,alt_text,title,sort_order,is_primary,storage_bucket,storage_path"
        )
        .eq("product_content_id", content.id)
        .eq("media_type", "image")
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (mediaError) {
        setMedia([]);
        setErrorMessage(messageFromError(mediaError, "Product media could not be loaded."));
        setIsLoading(false);
        return;
      }

      setMedia((mediaRows ?? []) as ProductMediaRow[]);
      setIsLoading(false);
    }

    void loadMedia();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <ComponentCard
      title="Media"
      desc="Approved vendor images archived in Modulex Storage and linked to this product."
    >
      {isLoading ? <FormHint>Loading product media…</FormHint> : null}

      {errorMessage ? (
        <Alert variant="error" title="Media could not be loaded" message={errorMessage} />
      ) : null}

      {!isLoading && !errorMessage && media.length === 0 ? (
        <FormHint>No media is linked to this product yet.</FormHint>
      ) : null}

      {!isLoading && media.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="light">{media.length} image{media.length === 1 ? "" : "s"}</Badge>
            {product ? <Badge color="info">{product.sku}</Badge> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {media.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]"
              >
                <div className="aspect-square bg-gray-50 p-3 dark:bg-gray-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.alt_text || item.title || product?.name || "Product image"}
                    className="h-full w-full rounded-lg object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-2 border-t border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.is_primary ? <Badge color="success">Primary</Badge> : null}
                    <Badge color="light">#{item.sort_order + 1}</Badge>
                  </div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {item.title || item.alt_text || `Product image ${item.sort_order + 1}`}
                  </p>
                  {item.storage_bucket && item.storage_path ? (
                    <p className="break-all text-xs text-gray-500 dark:text-gray-400">
                      {item.storage_bucket}/{item.storage_path}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </ComponentCard>
  );
}
