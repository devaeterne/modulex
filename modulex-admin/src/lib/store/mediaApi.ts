"use client";

import { supabase } from "@/lib/supabase/client";
import type { StoreMediaAsset } from "@/lib/store/mediaLibrary";

export type MediaLifecycleAction = "publish" | "unpublish";
export type ControlledStoreMediaCandidateId = "media-showroom-01" | "media-kitchen-01" | "media-kitchen-02" | "media-kitchen-03";

export const CONTROLLED_STORE_MEDIA_CANDIDATES: Array<{ id: ControlledStoreMediaCandidateId; label: string }> = [
  { id: "media-showroom-01", label: "Showroom source 01" },
  { id: "media-kitchen-01", label: "Kitchen project source 01" },
  { id: "media-kitchen-02", label: "Kitchen project source 02" },
  { id: "media-kitchen-03", label: "Kitchen project source 03" },
];

export type Gc2dMediaIntakeResult = {
  status: "created" | "duplicate";
  candidateId: string;
  assetId: string;
  source: { url: string; finalUrl: string };
  original: { mimeType: string; width: number; height: number; bytes: number; sha256: string };
  optimized: { mimeType: "image/webp"; width: number; height: number; bytes: number; sha256: string };
  staging: { bucket: "store-media-staging"; originalPath: string | null; optimizedPath: string | null };
  published: boolean;
};

type MediaApiResponse = { asset?: StoreMediaAsset; result?: Gc2dMediaIntakeResult; deleted?: boolean; error?: string };

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Authentication required.");
  return accessToken;
}

async function parseResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as MediaApiResponse;
  if (!response.ok) throw new Error(payload.error ?? "Media request failed.");
  return payload;
}

export async function importStoreMediaCandidate(candidateId: ControlledStoreMediaCandidateId) {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/admin/store-media/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ candidate_id: candidateId }),
  });
  const payload = await parseResponse(response);
  if (!payload.result) throw new Error("Media intake response did not include a result.");
  return payload.result;
}

export async function runMediaLifecycle(assetId: string, action: MediaLifecycleAction) {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/admin/store-media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ asset_id: assetId, action }),
  });
  const payload = await parseResponse(response);
  if (!payload.asset) throw new Error("Media lifecycle response did not include an asset.");
  return payload.asset;
}

export async function deleteMediaAsset(assetId: string) {
  const accessToken = await getAccessToken();
  const params = new URLSearchParams({ asset_id: assetId });
  const response = await fetch(`/api/admin/store-media?${params.toString()}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseResponse(response);
  if (!payload.deleted) throw new Error("Media delete response did not confirm deletion.");
}
