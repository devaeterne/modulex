import type { Metadata } from "next";

export function resolveManagedSeoTitle(
  seoTitle: string | null | undefined,
  fallbackTitle: string,
): Metadata["title"] {
  const managed = seoTitle?.trim();
  return managed ? { absolute: managed } : fallbackTitle;
}
